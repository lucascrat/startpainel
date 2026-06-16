import OpenAI from 'openai';
import puppeteer from 'puppeteer-core';
import os from 'os';
import path from 'path';

const BOB_LOGIN_URL = 'https://bobplayer.com/login';
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH ||
  (os.platform() === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/usr/bin/chromium');

// PINs comuns de playlist (fornecidos pelo operador)
const PINS = ['654321', '123456', '161917', '161719', '12345678', '87654321', '987654321', '123456789'];

/**
 * Lança Chrome SEM StealthPlugin — o Bob Player (React) só dispara os
 * handlers de clique com eventos de ponteiro nativos, e o Stealth interfere.
 */
function launchBobBrowser(profileNum = 0): Promise<any> {
  const suffix = profileNum > 0 ? `-${profileNum}` : '';
  const baseDir = process.env.PUPPETEER_USER_DATA_DIR ||
    path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'PuppeteerProfile');
  const userDataDir = profileNum > 0 ? `${baseDir.replace(/(-\d+)?$/, '')}${suffix}` : baseDir;

  return puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    userDataDir,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1280,900',
      '--disable-infobars',
      '--disable-features=PasswordLeakDetection,SafeBrowsingChromePasswordProtection',
      '--password-store=basic',
    ],
    defaultViewport: { width: 1280, height: 900 },
  });
}

/** Dispara sequência completa de pointer events num elemento (React-friendly). */
async function pointerClick(page: any, selector: string): Promise<boolean> {
  return page.evaluate((sel: string) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const seq = ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'mousemove',
      'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    for (const type of seq) {
      const Ctor = type.startsWith('pointer') ? PointerEvent : MouseEvent;
      el.dispatchEvent(new Ctor(type, {
        bubbles: true, cancelable: true, view: window,
        clientX: cx, clientY: cy, ...(type.startsWith('pointer') ? { pointerType: 'mouse' } : {}),
      } as any));
    }
    return true;
  }, selector);
}

async function loginBobPlayer(page: any, mac: string, deviceKey: string): Promise<boolean> {
  const openaiKey = process.env.OPENAI_API_KEY;

  console.log('[BobPlayer] Acessando bobplayer.com/login...');
  await page.goto(BOB_LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));

  // Aceita termos
  await page.evaluate(() => {
    (Array.from(document.querySelectorAll('button'))
      .find(b => /accept/i.test(b.textContent || '')) as HTMLElement | null)?.click();
  });
  await new Promise(r => setTimeout(r, 800));

  // Refresh captcha
  await page.evaluate(() => {
    (Array.from(document.querySelectorAll('button'))
      .find(b => /refresh/i.test(b.textContent || '')) as HTMLElement | null)?.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  const inputs = await page.$$('input:not([type=hidden])');
  const b0 = await inputs[0]?.boundingBox();
  if (b0) { await page.mouse.click(b0.x + b0.width / 2, b0.y + b0.height / 2, { clickCount: 3 }); await page.keyboard.type(mac, { delay: 100 }); }
  const b1 = await inputs[1]?.boundingBox();
  if (b1) { await page.mouse.click(b1.x + b1.width / 2, b1.y + b1.height / 2, { clickCount: 3 }); await page.keyboard.type(deviceKey, { delay: 100 }); }

  // Captcha com OpenAI Vision (retry em rate limit)
  if (inputs.length >= 3 && openaiKey) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const shot = await page.screenshot({ encoding: 'base64' });
        const openai = new OpenAI({ apiKey: openaiKey });
        const result = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'Retorne apenas o texto do captcha nesta imagem de login. Somente o código, sem espaços, máximo 6 caracteres.' },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${shot}`, detail: 'low' } },
            ],
          }],
          max_tokens: 20,
        });
        const captchaText = (result.choices[0]?.message?.content || '').trim().replace(/\s/g, '').toUpperCase().substring(0, 6);
        console.log(`[BobPlayer] Captcha: "${captchaText}" (tentativa ${attempt})`);
        const b2 = await inputs[2].boundingBox();
        if (b2) { await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2); await page.keyboard.type(captchaText, { delay: 100 }); }
        break;
      } catch (e: any) {
        if ((e.message?.includes('429') || e.status === 429) && attempt < 3) {
          console.warn(`[BobPlayer] OpenAI rate limit — aguardando 35s (${attempt}/3)...`);
          await new Promise(r => setTimeout(r, 35000));
          await page.evaluate(() => {
            (Array.from(document.querySelectorAll('button')).find(b => /refresh/i.test(b.textContent || '')) as HTMLElement | null)?.click();
          });
          await new Promise(r => setTimeout(r, 1200));
        } else { console.warn('[BobPlayer] OpenAI falhou:', e.message?.substring(0, 100)); break; }
      }
    }
  }

  await new Promise(r => setTimeout(r, 1200));

  // Clica LOGIN
  await page.evaluate(() => {
    (Array.from(document.querySelectorAll('button'))
      .find(b => /^login$/i.test(b.textContent?.trim() || '')) as HTMLElement | null)?.click();
  });

  try {
    await page.waitForFunction(() => window.location.pathname.startsWith('/dashboard'), { timeout: 15000 });
    console.log('[BobPlayer] Login OK → dashboard');
    return true;
  } catch {
    console.warn('[BobPlayer] Não redirecionou para /dashboard. URL:', page.url());
    return false;
  }
}

/** Fecha o aviso nativo do Chrome "Mude sua senha" que aparece após login. */
async function dismissChromeWarning(page: any) {
  await new Promise(r => setTimeout(r, 1500));
  await page.keyboard.press('Tab');
  await new Promise(r => setTimeout(r, 150));
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 300));
  await page.mouse.click(822, 374).catch(() => {});
  await new Promise(r => setTimeout(r, 300));
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 500));
}

/**
 * Verifica validade e atualiza a playlist no Bob Player.
 */
export async function runBobPlayerRepair(
  mac: string,
  deviceKey: string,
  playlistUrl: string,
  profileNum = 0
): Promise<{ success: boolean; status?: string; message: string }> {
  let browser: any = null;

  try {
    browser = await launchBobBrowser(profileNum);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // Login com até 3 tentativas (captcha pode ser lido errado pela OpenAI)
    let loggedIn = false;
    for (let tentativa = 1; tentativa <= 3 && !loggedIn; tentativa++) {
      if (tentativa > 1) console.log(`[BobPlayer] Tentativa de login ${tentativa}/3...`);
      loggedIn = await loginBobPlayer(page, mac, deviceKey);
    }
    if (!loggedIn) {
      try { await page.screenshot({ path: 'scratch/bob_login_fail.png' }); } catch {}
      return { success: false, message: 'Login falhou no Bob Player após 3 tentativas. Verifique MAC, device key ou captcha.' };
    }

    await dismissChromeWarning(page);
    await new Promise(r => setTimeout(r, 1500));

    // Verifica expiração
    const expirationData = await page.evaluate(() => {
      const text = document.body.innerText;
      const isExpired = /expired|vencido|vencida|expirado/i.test(text);
      const dateMatch = text.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4})|(\d{4}[\/\-]\d{2}[\/\-]\d{2})/);
      return { isExpired, date: dateMatch ? dateMatch[0] : null };
    });
    if (expirationData.isExpired) {
      return { success: true, status: 'expired', message: `Bob Player VENCIDO${expirationData.date ? ` (${expirationData.date})` : ''}. Necessário renovar a licença.` };
    }

    // Clica o lápis de editar (PointerEvent sequence — React precisa disso)
    console.log('[BobPlayer] Clicando lápis de editar...');
    await page.waitForFunction(() => !!document.querySelector('svg.text-blue-500.cursor-pointer'), { timeout: 10000 });
    const clicked = await pointerClick(page, 'svg.text-blue-500.cursor-pointer');
    if (!clicked) throw new Error('Lápis de editar não encontrado.');

    // Aguarda o modal "Enter Playlist PIN"
    let pinModalOpen = false;
    for (let i = 0; i < 50; i++) {
      await new Promise(r => setTimeout(r, 100));
      pinModalOpen = await page.evaluate(() => /enter playlist pin|playlist pin/i.test(document.body.innerText));
      if (pinModalOpen) { console.log(`[BobPlayer] Modal PIN aberto (${(i + 1) * 100}ms)`); break; }
    }

    if (pinModalOpen) {
      // Tenta cada PIN até o modal fechar
      let pinOk = false;
      for (const pin of PINS) {
        const stillOpen = await page.evaluate(() => /enter playlist pin|playlist pin/i.test(document.body.innerText));
        if (!stillOpen) { pinOk = true; break; }

        // Preenche o input do PIN (o input visível que não é Search)
        await page.evaluate((p: string) => {
          const inp = Array.from(document.querySelectorAll('input'))
            .find(i => (i as HTMLInputElement).placeholder !== 'Search' && (i as HTMLElement).offsetParent !== null) as HTMLInputElement | null;
          if (inp) {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            setter?.call(inp, p);
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, pin);
        await new Promise(r => setTimeout(r, 200));

        // Clica OK
        await page.evaluate(() => {
          (Array.from(document.querySelectorAll('button')).find(b => /^ok$/i.test(b.textContent?.trim() || '')) as HTMLElement | null)?.click();
        });
        await new Promise(r => setTimeout(r, 1000));

        const closed = await page.evaluate(() => !/enter playlist pin|playlist pin/i.test(document.body.innerText));
        if (closed) { console.log(`[BobPlayer] ✅ PIN correto: ${pin}`); pinOk = true; break; }
        console.log(`[BobPlayer]   PIN ${pin} incorreto`);
      }
      if (!pinOk) {
        return { success: false, message: 'PIN da playlist não confere. Nenhum dos PINs conhecidos funcionou.' };
      }
    }

    await new Promise(r => setTimeout(r, 1500));
    try { await page.screenshot({ path: 'scratch/bob_after_pin.png' }); } catch {}

    // Localiza o campo de URL no formulário de edição
    console.log('[BobPlayer] Procurando campo de URL...');
    let urlHandle = await page.evaluateHandle(() => {
      return Array.from(document.querySelectorAll('input, textarea')).find(el => {
        const i = el as HTMLInputElement;
        if (i.placeholder === 'Search') return false;
        if ((i as HTMLElement).offsetParent === null) return false;
        const p = (i.placeholder || '').toLowerCase();
        const n = (i.name || '').toLowerCase();
        const v = (i.value || '').toLowerCase();
        return p.includes('url') || p.includes('http') || p.includes('m3u')
          || n.includes('url') || n.includes('m3u') || v.startsWith('http')
          || i.type === 'url' || i.type === 'text';
      }) || null;
    });

    let urlEl = urlHandle.asElement();
    if (!urlEl) {
      try { await page.screenshot({ path: 'scratch/bob_no_url.png' }); } catch {}
      throw new Error('Campo de URL não encontrado no formulário de edição.');
    }

    console.log('[BobPlayer] Preenchendo URL da playlist...');
    await urlEl.click({ clickCount: 3 });
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await urlEl.type(playlistUrl, { delay: 20 });
    await new Promise(r => setTimeout(r, 500));

    // Salva
    console.log('[BobPlayer] Salvando...');
    const saved = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button, input[type=submit]'))
        .find(b => /save|salvar|update|submit|confirm/i.test((b as HTMLButtonElement).textContent || (b as HTMLInputElement).value || '')) as HTMLElement | null;
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!saved) await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 4000));

    try { await page.screenshot({ path: 'scratch/bob_saved.png' }); } catch {}
    console.log('[BobPlayer] ✅ Playlist atualizada!');
    return { success: true, status: 'updated', message: 'Lista atualizada no Bob Player com sucesso! 🎬' };

  } catch (e: any) {
    console.error('[BobPlayer] ERRO:', e.message);
    return { success: false, message: e.message };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
