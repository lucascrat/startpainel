import puppeteer from 'puppeteer-core';
import os from 'os';
import path from 'path';

const CLOUDDY_LOGIN = 'https://console.clouddy.online/user/auth/login';
const CLOUDDY_TV_EDIT = 'https://console.clouddy.online/user/tv-playlist/edit';
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH ||
  (os.platform() === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/usr/bin/chromium');

/**
 * Converte uma URL get.php (M3U Xtream) para o formato xc:// que o Clouddy usa.
 * Ex.: http://host:port/get.php?username=U&password=P&...  →  xc://U:P@host:port/streaming=m3u8
 * Se já vier em formato xc://, retorna como está.
 */
export function toXtreamUrl(playlistUrl: string): string | null {
  if (!playlistUrl) return null;
  if (playlistUrl.startsWith('xc://')) return playlistUrl;
  try {
    const u = new URL(playlistUrl);
    const username = u.searchParams.get('username');
    const password = u.searchParams.get('password');
    if (!username || !password) return null;
    const host = u.hostname;
    const port = u.port || (u.protocol === 'https:' ? '443' : '80');
    return `xc://${username}:${password}@${host}:${port}/streaming=m3u8`;
  } catch {
    return null;
  }
}

/** Lança Chrome com perfil dedicado + flags anti-detecção (passa pelo Cloudflare Turnstile). */
function launchClouddyBrowser(profileNum = 0): Promise<any> {
  const suffix = profileNum > 0 ? `-${profileNum}` : '';
  const baseDir = process.env.PUPPETEER_USER_DATA_DIR ||
    path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'PuppeteerProfile');
  const userDataDir = profileNum > 0 ? `${baseDir.replace(/(-\d+)?$/, '')}${suffix}` : baseDir;

  return puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    userDataDir,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900', '--disable-infobars',
      '--disable-blink-features=AutomationControlled',  // esconde navigator.webdriver
      '--disable-features=PasswordLeakDetection,IsolateOrigins,site-per-process',
      '--password-store=basic', '--lang=pt-BR',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    defaultViewport: null,
  });
}

async function loginClouddy(page: any, email: string, senha: string): Promise<boolean> {
  console.log('[Clouddy] Acessando login...');
  await page.goto(CLOUDDY_LOGIN, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));

  // Se já está logado (sessão salva), pula
  if (page.url().includes('/dashboard')) { console.log('[Clouddy] Já logado (sessão).'); return true; }

  const emailInp = await page.$('#form_email, input[type=email]');
  if (emailInp) { await emailInp.click({ clickCount: 3 }); await emailInp.type(email, { delay: 90 }); }
  const passInp = await page.$('#form_password, input[type=password]');
  if (passInp) { await passInp.click({ clickCount: 3 }); await passInp.type(senha, { delay: 90 }); }
  await new Promise(r => setTimeout(r, 1200));

  // Clica o checkbox do Turnstile (iframe ou coordenada)
  let clicked = false;
  for (let tries = 0; tries < 3 && !clicked; tries++) {
    const tsFrame = page.frames().find((f: any) => /challenges\.cloudflare|turnstile/i.test(f.url()));
    if (tsFrame) {
      const cb = await tsFrame.waitForSelector('input[type=checkbox]', { timeout: 4000 }).catch(() => null);
      if (cb) { await cb.click().catch(() => {}); clicked = true; }
    }
    if (!clicked) {
      await page.mouse.click(484, 428);
      await new Promise(r => setTimeout(r, 2000));
      const hasToken = await page.evaluate(() => {
        const t = document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null;
        return !!(t && t.value && t.value.length > 20);
      });
      if (hasToken) clicked = true;
    }
  }

  // Aguarda token do Turnstile
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const ok = await page.evaluate(() => {
      const t = document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null;
      return !!(t && t.value && t.value.length > 20);
    });
    if (ok) { console.log(`[Clouddy] Turnstile resolvido (${i + 1}s)`); break; }
  }

  // Clica Authorize
  await page.evaluate(() => {
    (Array.from(document.querySelectorAll('button, input[type=submit], a'))
      .find(b => /authoriz|autoriz/i.test(b.textContent || (b as HTMLInputElement).value || '')) as HTMLElement | null)?.click();
  });

  try {
    await page.waitForFunction(() => window.location.pathname.includes('dashboard'), { timeout: 15000 });
    console.log('[Clouddy] Login OK → dashboard');
    return true;
  } catch {
    console.warn('[Clouddy] Login não confirmou dashboard. URL:', page.url());
    return false;
  }
}

/**
 * Atualiza a playlist (link M3U/Xtream) na conta Clouddy do cliente.
 * @param email     email de login no Clouddy
 * @param senha     senha de login no Clouddy
 * @param playlistUrl  URL get.php ou xc:// — convertida para xc:// automaticamente
 */
export async function runClouddyUpdatePlaylist(
  email: string,
  senha: string,
  playlistUrl: string,
  profileNum = 0
): Promise<{ success: boolean; message: string }> {
  let browser: any = null;

  const xcUrl = toXtreamUrl(playlistUrl);
  if (!xcUrl) {
    return { success: false, message: 'Não consegui converter a URL da playlist para o formato Clouddy (xc://).' };
  }

  try {
    browser = await launchClouddyBrowser(profileNum);
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // Login com até 3 tentativas (Turnstile/captcha)
    let loggedIn = false;
    for (let t = 1; t <= 3 && !loggedIn; t++) {
      if (t > 1) console.log(`[Clouddy] Tentativa de login ${t}/3...`);
      loggedIn = await loginClouddy(page, email, senha);
    }
    if (!loggedIn) {
      try { await page.screenshot({ path: 'scratch/clouddy_login_fail.png' }); } catch {}
      return { success: false, message: 'Login falhou no Clouddy. Verifique email/senha ou o Cloudflare bloqueou.' };
    }

    // Vai para a edição da playlist TV
    console.log('[Clouddy] Acessando edição da playlist...');
    await page.goto(CLOUDDY_TV_EDIT, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    // Preenche o campo form[url] com a URL xc://
    const urlInp = await page.$('#form_url, input[name="form[url]"]');
    if (!urlInp) {
      try { await page.screenshot({ path: 'scratch/clouddy_no_url.png' }); } catch {}
      throw new Error('Campo de URL da playlist não encontrado no Clouddy.');
    }

    console.log(`[Clouddy] Preenchendo URL: ${xcUrl}`);
    await urlInp.click({ clickCount: 3 });
    await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await urlInp.type(xcUrl, { delay: 15 });
    await new Promise(r => setTimeout(r, 500));

    // Clica Save
    console.log('[Clouddy] Salvando...');
    const saved = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button, input[type=submit]'))
        .find(b => /^save$|salvar/i.test((b as HTMLButtonElement).textContent?.trim() || (b as HTMLInputElement).value || '')) as HTMLElement | null;
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!saved) await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 4000));

    try { await page.screenshot({ path: 'scratch/clouddy_saved.png' }); } catch {}
    console.log('[Clouddy] ✅ Playlist atualizada!');
    return { success: true, message: 'Lista atualizada no Clouddy com sucesso! 🎬' };

  } catch (e: any) {
    console.error('[Clouddy] ERRO:', e.message);
    return { success: false, message: e.message };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
