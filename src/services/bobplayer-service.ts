import { GoogleGenerativeAI } from '@google/generative-ai';
import { Browser } from 'puppeteer-core';
import { launchBrowser, clickButtonByText } from './startpainel-puppeteer.js';

const BOB_LOGIN_URL = 'https://bobplayer.com/device/login';

/**
 * Faz login no Bob Player com MAC + device key + captcha (Gemini Vision).
 * Retorna a page logada ou null em caso de falha.
 */
async function loginBobPlayer(page: any, mac: string, deviceKey: string): Promise<boolean> {
  const geminiKey = process.env.GEMINI_API_KEY;

  console.log(`[BobPlayer] Acessando ${BOB_LOGIN_URL}...`);
  await page.goto(BOB_LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  // Aceita modal de termos se aparecer
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, a'));
    const btn = btns.find(b => /accept|agree|ok/i.test(b.textContent || '')) as HTMLElement | null;
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Atualiza captcha se existir
  await clickButtonByText(page, ['Refresh Captcha', 'Refresh', 'Atualizar Captcha']).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));

  // Preenche MAC e device key com digitação humana
  const inputs = await page.$$('input[type="text"], input[type="password"], input:not([type="hidden"])');
  console.log(`[BobPlayer] ${inputs.length} inputs encontrados`);

  if (inputs.length >= 1) {
    const macBox = await inputs[0].boundingBox();
    if (macBox) {
      await page.mouse.click(macBox.x + macBox.width / 2, macBox.y + macBox.height / 2, { clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.keyboard.type(mac, { delay: 150 });
    }
  }
  await new Promise(r => setTimeout(r, 800));

  if (inputs.length >= 2) {
    const keyBox = await inputs[1].boundingBox();
    if (keyBox) {
      await page.mouse.click(keyBox.x + keyBox.width / 2, keyBox.y + keyBox.height / 2, { clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.keyboard.type(deviceKey, { delay: 150 });
    }
  }
  await new Promise(r => setTimeout(r, 800));

  // Resolve captcha com Gemini Vision (se existir campo de captcha)
  if (inputs.length >= 3 && geminiKey) {
    console.log('[BobPlayer] Captcha detectado — usando Gemini Vision...');
    const screenshot = await page.screenshot({ encoding: 'base64' });
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    try {
      const result = await model.generateContent([
        'Retorne apenas o texto do captcha desta imagem de login. Retorne somente o codigo, sem espaços.',
        { inlineData: { data: screenshot as string, mimeType: 'image/png' } },
      ]);
      const captchaText = result.response.text().trim().replace(/\s/g, '').toUpperCase();
      console.log(`[BobPlayer] Gemini leu captcha: "${captchaText}"`);
      const captchaBox = await inputs[2].boundingBox();
      if (captchaBox) {
        await page.mouse.click(captchaBox.x + captchaBox.width / 2, captchaBox.y + captchaBox.height / 2);
        await page.keyboard.type(captchaText, { delay: 120 });
      }
    } catch (e: any) {
      console.warn('[BobPlayer] Gemini falhou ao ler captcha:', e.message);
    }
  }

  await new Promise(r => setTimeout(r, 2000));

  // Clica no botão de login
  const loginHandle = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('button, input[type="submit"], a'));
    return btns.find(b => /login|entrar|sign\s*in|submit/i.test(b.textContent || (b as HTMLInputElement).value || ''));
  });
  if (loginHandle?.asElement()) {
    const lBox = await (loginHandle.asElement() as any).boundingBox();
    if (lBox) {
      await page.mouse.move(lBox.x + lBox.width / 2, lBox.y + lBox.height / 2);
      await page.mouse.click(lBox.x + lBox.width / 2, lBox.y + lBox.height / 2);
    }
  } else {
    await page.keyboard.press('Enter');
  }

  // Aguarda indicador de sucesso
  try {
    await page.waitForFunction(
      () => {
        const t = document.body.innerText;
        return t.includes('Manage Playlist') || t.includes('playlist') || t.includes('Add Playlist')
          || t.includes('dashboard') || t.includes('home') || t.includes('Device');
      },
      { timeout: 15000 }
    );
    console.log('[BobPlayer] Login realizado com sucesso!');
    return true;
  } catch {
    console.warn('[BobPlayer] Login não confirmado. URL atual:', page.url());
    return false;
  }
}

/**
 * Verifica se o dispositivo está vencido e atualiza a playlist M3U no Bob Player.
 * Mesma lógica do IBO Repair: verifica expiração antes de atualizar.
 */
export async function runBobPlayerRepair(
  mac: string,
  deviceKey: string,
  playlistUrl: string,
  profileNum = 0
): Promise<{ success: boolean; status?: string; message: string }> {
  let browser: Browser | null = null;

  try {
    browser = await launchBrowser(false, profileNum) as any;
    const page = await (browser as any).newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const loggedIn = await loginBobPlayer(page, mac, deviceKey);
    if (!loggedIn) {
      // Tira print para debug
      try { await page.screenshot({ path: 'scratch/bob_login_fail.png' }); } catch {}
      return { success: false, message: 'Não foi possível logar no Bob Player. MAC ou device key inválidos, ou captcha não resolvido.' };
    }

    // Verifica expiração
    console.log('[BobPlayer] Verificando validade...');
    const expirationData = await page.evaluate(() => {
      const text = document.body.innerText;
      const isExpired = /expired|vencido|vencida|expirado/i.test(text);
      const dateMatch = text.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4})|(\d{4}[\/\-]\d{2}[\/\-]\d{2})/);
      return { isExpired, date: dateMatch ? dateMatch[0] : 'desconhecida' };
    });

    if (expirationData.isExpired) {
      console.log(`[BobPlayer] App EXPIRADO em ${expirationData.date}`);
      return {
        success: true,
        status: 'expired',
        message: `O Bob Player está VENCIDO (venceu em ${expirationData.date}). É necessário renovar a licença do app.`,
      };
    }

    // Atualiza playlist
    console.log('[BobPlayer] App ativo. Atualizando playlist...');
    await new Promise(r => setTimeout(r, 1500));

    // Fecha modal recorrente se aparecer
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      const btn = btns.find(b => /accept|agree|ok/i.test(b.textContent || '')) as HTMLElement | null;
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Clica em editar (lápis azul) ou em Add Playlist
    const editHandle = await page.evaluateHandle(() => {
      const selectors = ['svg.text-blue-500', 'a[href*="edit"]', '.fa-edit', '.fa-pencil', 'i.fa-edit', 'tbody tr td div svg'];
      for (const s of selectors) {
        const el = document.querySelector(s);
        if (el) return el;
      }
      return null;
    });

    if (editHandle?.asElement()) {
      const box = await (editHandle.asElement() as any).boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }
    } else {
      console.log('[BobPlayer] Botão editar não encontrado — tentando Add Playlist...');
      await clickButtonByText(page, ['Add Playlist', 'Add XC Playlist', 'Add']).catch(() => {});
    }

    await new Promise(r => setTimeout(r, 2500));

    // PIN se aparecer
    const pinInp = await page.waitForSelector(
      'input[id="swal2-input"], input[type="password"], input[placeholder*="PIN"]',
      { timeout: 5000 }
    ).catch(() => null);
    if (pinInp) {
      console.log('[BobPlayer] PIN detectado, preenchendo...');
      await pinInp.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await (pinInp as any).type('654321', { delay: 100 });
      await page.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 4000));
    }

    // Campo de URL da playlist
    let urlInp = await page.waitForSelector(
      'input[name*="url"], input[placeholder*="http"], input[placeholder*="m3u"]',
      { timeout: 10000 }
    ).catch(() => null);

    if (!urlInp) {
      // Fallback por evaluate
      const coords = await page.evaluate(() => {
        const inp = Array.from(document.querySelectorAll('input')).find(i => {
          const p = (i.placeholder || '').toLowerCase();
          const n = (i.name || '').toLowerCase();
          return p.includes('url') || p.includes('http') || n.includes('url') || n.includes('m3u');
        });
        if (!inp) return null;
        const r = inp.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      if (coords) {
        await page.mouse.click(coords.x, coords.y);
        urlInp = await page.$('input:focus');
      }
    }

    if (!urlInp) {
      await page.screenshot({ path: 'scratch/bob_playlist_fail.png' });
      throw new Error('Campo de URL da playlist não encontrado no Bob Player.');
    }

    await (urlInp as any).click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await (urlInp as any).type(playlistUrl, { delay: 30 });

    await clickButtonByText(page, ['SAVE', 'Save', 'Salvar', 'OK', 'Submit']);
    await new Promise(r => setTimeout(r, 4000));

    console.log('[BobPlayer] ✅ Playlist atualizada com sucesso!');
    return {
      success: true,
      status: 'updated',
      message: 'Lista atualizada com sucesso no Bob Player! O sinal deve voltar em instantes. 🎬',
    };

  } catch (e: any) {
    console.error('[BobPlayer] ERRO:', e.message);
    return { success: false, message: e.message };
  } finally {
    if (browser) await (browser as any).close().catch(() => {});
  }
}
