import puppeteer from 'puppeteer-core';
import os from 'os';
import path from 'path';

const CLOUDDY_LOGIN = 'https://console.clouddy.online/user/auth/login';
const CLOUDDY_TV_EDIT = 'https://console.clouddy.online/user/tv-playlist/edit';
const CLOUDDY_VOD_EDIT = 'https://console.clouddy.online/user/vod-playlist/edit';
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH ||
  (os.platform() === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/usr/bin/chromium');

/**
 * Extrai credenciais Xtream (user/pass/host/port) de uma URL get.php ou xc://.
 */
function parseXtreamCreds(playlistUrl: string): { user: string; pass: string; host: string; port: string } | null {
  if (!playlistUrl) return null;
  // Formato xc://user:pass@host:port/...
  const xcMatch = playlistUrl.match(/^xc:\/\/([^:]+):([^@]+)@([^:/]+):?(\d+)?/);
  if (xcMatch) {
    return { user: xcMatch[1], pass: xcMatch[2], host: xcMatch[3], port: xcMatch[4] || '80' };
  }
  // Formato get.php?username=...&password=...
  try {
    const u = new URL(playlistUrl);
    const user = u.searchParams.get('username');
    const pass = u.searchParams.get('password');
    if (!user || !pass) return null;
    const host = u.hostname;
    const port = u.port || (u.protocol === 'https:' ? '443' : '80');
    return { user, pass, host, port };
  } catch {
    return null;
  }
}

/** URL formato TV (HLS): xc://U:P@host:port/streaming=m3u8 */
export function toXtreamTvUrl(playlistUrl: string): string | null {
  const c = parseXtreamCreds(playlistUrl);
  return c ? `xc://${c.user}:${c.pass}@${c.host}:${c.port}/streaming=m3u8` : null;
}

/** URL formato VOD: xc://U:P@host:port/ */
export function toXtreamVodUrl(playlistUrl: string): string | null {
  const c = parseXtreamCreds(playlistUrl);
  return c ? `xc://${c.user}:${c.pass}@${c.host}:${c.port}/` : null;
}

/** Alias legado — mantido para compatibilidade. */
export function toXtreamUrl(playlistUrl: string): string | null {
  return toXtreamTvUrl(playlistUrl);
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
 * Atualiza o campo form[url] da página atual com newUrl (apaga o antigo) e salva.
 */
async function updatePlaylistField(page: any, newUrl: string, label: string): Promise<boolean> {
  const urlInp = await page.$('#form_url, input[name="form[url]"]');
  if (!urlInp) {
    console.warn(`[Clouddy] Campo de URL não encontrado em ${label}`);
    return false;
  }

  // Foco no campo, seleciona tudo e apaga
  await urlInp.click({ clickCount: 3 });
  await new Promise(r => setTimeout(r, 200));
  await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
  await page.keyboard.press('Delete');
  await new Promise(r => setTimeout(r, 200));

  // Digita a nova URL
  await urlInp.type(newUrl, { delay: 15 });
  await new Promise(r => setTimeout(r, 500));

  // Clica Save
  const saved = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button, input[type=submit]'))
      .find(b => /^save$|salvar/i.test((b as HTMLButtonElement).textContent?.trim() || (b as HTMLInputElement).value || '')) as HTMLElement | null;
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!saved) await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 4000));

  console.log(`[Clouddy] ✅ ${label} atualizada`);
  return true;
}

/**
 * Atualiza AS DUAS listas (TV + VOD) na conta Clouddy do cliente.
 * Apaga a URL antiga se houver e salva a nova em cada aba.
 *
 * @param email     email de login no Clouddy
 * @param senha     senha de login no Clouddy
 * @param playlistUrl  URL get.php ou xc:// — convertida automaticamente para os 2 formatos
 */
export async function runClouddyUpdatePlaylist(
  email: string,
  senha: string,
  playlistUrl: string,
  profileNum = 0
): Promise<{ success: boolean; message: string }> {
  let browser: any = null;

  const tvUrl = toXtreamTvUrl(playlistUrl);
  const vodUrl = toXtreamVodUrl(playlistUrl);
  if (!tvUrl || !vodUrl) {
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

    const results = { tv: false, vod: false };

    // ── Aba TV ──────────────────────────────────────────────────────────────
    console.log('[Clouddy] Acessando aba TV...');
    await page.goto(CLOUDDY_TV_EDIT, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    console.log(`[Clouddy] Atualizando TV: ${tvUrl}`);
    results.tv = await updatePlaylistField(page, tvUrl, 'TV');
    try { await page.screenshot({ path: 'scratch/clouddy_tv_saved.png' }); } catch {}

    // ── Aba VOD ─────────────────────────────────────────────────────────────
    console.log('[Clouddy] Acessando aba VOD...');
    await page.goto(CLOUDDY_VOD_EDIT, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    console.log(`[Clouddy] Atualizando VOD: ${vodUrl}`);
    results.vod = await updatePlaylistField(page, vodUrl, 'VOD');
    try { await page.screenshot({ path: 'scratch/clouddy_vod_saved.png' }); } catch {}

    if (!results.tv && !results.vod) {
      return { success: false, message: 'Não consegui atualizar nem a TV nem o VOD no Clouddy.' };
    }

    const parts: string[] = [];
    if (results.tv) parts.push('TV');
    if (results.vod) parts.push('VOD');

    return {
      success: true,
      message: `Lista atualizada no Clouddy (${parts.join(' + ')}) com sucesso! 🎬`,
    };

  } catch (e: any) {
    console.error('[Clouddy] ERRO:', e.message);
    return { success: false, message: e.message };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
