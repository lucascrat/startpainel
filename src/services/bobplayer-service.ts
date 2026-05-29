import { GoogleGenerativeAI } from '@google/generative-ai';
import { Browser } from 'puppeteer-core';
import { launchBrowser } from './startpainel-puppeteer.js';

const BOB_LOGIN_URL = 'https://bobplayer.com/login';

async function loginBobPlayer(page: any, mac: string, deviceKey: string): Promise<boolean> {
  const geminiKey = process.env.GEMINI_API_KEY;

  console.log('[BobPlayer] Acessando bobplayer.com/login...');
  await page.goto(BOB_LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  // Aceita termos
  await page.evaluate(() => {
    (Array.from(document.querySelectorAll('button'))
      .find(b => /accept/i.test(b.textContent || '')) as HTMLElement | null)?.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Refresh captcha
  await page.evaluate(() => {
    (Array.from(document.querySelectorAll('button'))
      .find(b => /refresh/i.test(b.textContent || '')) as HTMLElement | null)?.click();
  });
  await new Promise(r => setTimeout(r, 1200));

  // Preenche inputs: [0]=mac-address [1]=device-key [2]=captcha
  const inputs = await page.$$('input:not([type="hidden"])');
  console.log(`[BobPlayer] ${inputs.length} inputs encontrados`);

  const b0 = await inputs[0]?.boundingBox();
  if (b0) { await page.mouse.click(b0.x+b0.width/2,b0.y+b0.height/2,{clickCount:3}); await page.keyboard.press('Backspace'); await page.keyboard.type(mac,{delay:150}); }
  await new Promise(r => setTimeout(r, 500));
  const b1 = await inputs[1]?.boundingBox();
  if (b1) { await page.mouse.click(b1.x+b1.width/2,b1.y+b1.height/2,{clickCount:3}); await page.keyboard.press('Backspace'); await page.keyboard.type(deviceKey,{delay:150}); }
  await new Promise(r => setTimeout(r, 500));

  if (inputs.length >= 3 && geminiKey) {
    console.log('[BobPlayer] Resolvendo captcha com Gemini...');
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const screenshot = await page.screenshot({ encoding: 'base64' });
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent([
          'Retorne apenas o texto do captcha nesta imagem. Somente o código, sem espaços.',
          { inlineData: { data: screenshot as string, mimeType: 'image/png' } },
        ]);
        const captchaText = result.response.text().trim().replace(/\s/g, '').toUpperCase();
        console.log(`[BobPlayer] Captcha: "${captchaText}" (tentativa ${attempt})`);
        const b2 = await inputs[2].boundingBox();
        if (b2) { await page.mouse.click(b2.x+b2.width/2,b2.y+b2.height/2); await page.keyboard.type(captchaText,{delay:120}); }
        break;
      } catch (e: any) {
        const is429 = e.message?.includes('429') || e.status === 429;
        if (is429 && attempt < 3) {
          console.warn(`[BobPlayer] Gemini 429 — aguardando 35s (tentativa ${attempt}/3)...`);
          await new Promise(r => setTimeout(r, 35000));
          await page.evaluate(() => {
            (Array.from(document.querySelectorAll('button'))
              .find(b => /refresh/i.test(b.textContent || '')) as HTMLElement | null)?.click();
          });
          await new Promise(r => setTimeout(r, 1200));
        } else {
          console.warn(`[BobPlayer] Gemini falhou (tentativa ${attempt}):`, e.message?.substring(0, 120));
          break;
        }
      }
    }
  }

  await new Promise(r => setTimeout(r, 1500));

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

/**
 * Verifica validade e atualiza playlist no Bob Player.
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
    await page.setViewport({ width: 1280, height: 900 });

    const loggedIn = await loginBobPlayer(page, mac, deviceKey);
    if (!loggedIn) {
      try { await page.screenshot({ path: 'scratch/bob_login_fail.png' }); } catch {}
      return { success: false, message: 'Login falhou no Bob Player. Verifique MAC, device key ou captcha.' };
    }

    // Fecha o aviso nativo do Chrome "Mude sua senha" (password breach warning)
    // É uma dialog do Chrome, não da página — Escape ou Enter a fecha
    await new Promise(r => setTimeout(r, 1500));
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 500));
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 1000));

    // Aguarda tabela carregar completamente
    await new Promise(r => setTimeout(r, 2000));

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

    // Encontra o lápis de editar na row da playlist "START"
    console.log('[BobPlayer] Localizando ícone de editar na tabela...');
    const editBox = await page.evaluate(() => {
      // Estratégia 1: encontra a row que contém "START" ou "Protected" e pega o primeiro svg/button de actions
      const rows = Array.from(document.querySelectorAll('tr, [class*="row"]'));
      for (const row of rows) {
        const text = row.textContent || '';
        if (text.includes('START') || text.includes('Protected')) {
          // Procura SVG de editar dentro dessa row
          const svgs = Array.from(row.querySelectorAll('svg'));
          const editSvg = svgs[0]; // Primeiro ícone de ação = editar (lápis)
          if (editSvg) {
            const r = editSvg.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2, found: 'row-svg' };
          }
          // Fallback: qualquer elemento clicável na row
          const clickable = row.querySelector('a, button') as HTMLElement | null;
          if (clickable) {
            const r = clickable.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2, found: 'row-clickable' };
          }
        }
      }
      // Estratégia 2: pega o último conjunto de SVGs da página (os de ação estão no final do DOM)
      const allSvgs = Array.from(document.querySelectorAll('svg'));
      // Os ícones de ação ficam dentro das rows da tabela, longe do sidebar
      // Filtra SVGs que estão em posição horizontal > 800px (área de conteúdo principal, não sidebar)
      for (const svg of allSvgs) {
        const r = svg.getBoundingClientRect();
        if (r.x > 900 && r.y > 200 && r.y < 450 && r.width < 30) {
          return { x: r.x + r.width / 2, y: r.y + r.height / 2, found: 'position-svg' };
        }
      }
      return null;
    });

    if (editBox) {
      console.log(`[BobPlayer] Clicando editar via "${editBox.found}" em (${editBox.x.toFixed(0)}, ${editBox.y.toFixed(0)})`);
      await page.mouse.move(editBox.x, editBox.y);
      await page.mouse.click(editBox.x, editBox.y);
    } else {
      // Último fallback: clica em "Add Playlist" (cria uma nova)
      console.log('[BobPlayer] Nenhum editar encontrado — usando Add Playlist');
      await page.evaluate(() => {
        (Array.from(document.querySelectorAll('button'))
          .find(b => /add playlist/i.test(b.textContent || '')) as HTMLElement | null)?.click();
      });
    }

    await new Promise(r => setTimeout(r, 3000));

    // PIN se aparecer
    const pinInp = await page.waitForSelector(
      'input[id="swal2-input"], input[placeholder*="PIN"], input[placeholder*="pin"]',
      { timeout: 4000 }
    ).catch(() => null);
    if (pinInp) {
      console.log('[BobPlayer] PIN detectado...');
      await (pinInp as any).click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await (pinInp as any).type('654321', { delay: 100 });
      await page.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 3000));
    }

    // Tira screenshot para debug
    try { await page.screenshot({ path: 'scratch/bob_before_url.png' }); } catch {}

    // Campo URL da playlist — procura por vários seletores
    console.log('[BobPlayer] Procurando campo de URL...');
    let urlInp = await page.waitForSelector(
      'input[name*="url"], input[placeholder*="http"], input[placeholder*="m3u"], input[type="url"], textarea[name*="url"]',
      { timeout: 8000 }
    ).catch(() => null);

    if (!urlInp) {
      // Fallback: qualquer input visível com valor http ou vazio que não seja search
      const coords = await page.evaluate(() => {
        const inp = Array.from(document.querySelectorAll('input, textarea')).find(el => {
          const i = el as HTMLInputElement;
          if (i.placeholder === 'Search') return false;
          const p = (i.placeholder || '').toLowerCase();
          const n = (i.name || '').toLowerCase();
          const v = (i.value || '').toLowerCase();
          return p.includes('url') || p.includes('http') || p.includes('m3u')
            || n.includes('url') || n.includes('m3u')
            || v.startsWith('http')
            || (i.offsetParent !== null && i.type !== 'hidden' && i.placeholder !== 'Search');
        }) as HTMLInputElement | null;
        if (!inp) return null;
        const r = inp.getBoundingClientRect();
        // Confirma que está visível (não é o search bar em cima)
        if (r.y < 100) return null;
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      if (coords) {
        await page.mouse.click(coords.x, coords.y);
        urlInp = await page.$('input:focus, textarea:focus');
      }
    }

    if (!urlInp) {
      try { await page.screenshot({ path: 'scratch/bob_no_url.png' }); } catch {}
      throw new Error('Campo de URL não encontrado. Verifique scratch/bob_before_url.png para debug.');
    }

    console.log('[BobPlayer] Campo de URL encontrado — digitando playlist...');
    await (urlInp as any).click({ clickCount: 3 });
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await (urlInp as any).type(playlistUrl, { delay: 20 });
    await new Promise(r => setTimeout(r, 500));

    // Salva
    console.log('[BobPlayer] Salvando...');
    const saved = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button, input[type=submit]'))
        .find(b => /save|salvar|ok|update|submit|confirm/i.test(
          (b as HTMLButtonElement).textContent || (b as HTMLInputElement).value || ''
        )) as HTMLElement | null;
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!saved) await page.keyboard.press('Enter');

    await new Promise(r => setTimeout(r, 4000));

    console.log('[BobPlayer] ✅ Playlist atualizada!');
    return { success: true, status: 'updated', message: 'Lista atualizada no Bob Player com sucesso! 🎬' };

  } catch (e: any) {
    console.error('[BobPlayer] ERRO:', e.message);
    return { success: false, message: e.message };
  } finally {
    if (browser) await (browser as any).close().catch(() => {});
  }
}
