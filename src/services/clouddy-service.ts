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
 *
 * IMPORTANTE: o Clouddy usa Yii/jQuery — não React puro. Os inputs são "uncontrolled"
 * mas validação acontece no submit. Usar setter nativo HTMLInputElement.value via
 * Object.getOwnPropertyDescriptor é o método mais confiável.
 */
async function updatePlaylistField(page: any, newUrl: string, label: string): Promise<boolean> {
  const sel = '#form_url, input[name="form[url]"]';
  const exists = await page.$(sel);
  if (!exists) {
    console.warn(`[Clouddy] Campo de URL não encontrado em ${label}`);
    return false;
  }

  // Lê valor atual
  const valorAntes = await page.evaluate((s: string) => (document.querySelector(s) as HTMLInputElement)?.value || '', sel);
  console.log(`[Clouddy] ${label} - valor atual: "${valorAntes || '(vazio)'}"`);

  // ── ESTRATÉGIA: foca, seleciona TODO o conteúdo via .select() do JS,
  // depois usa Input.insertText (CDP) — que substitui a seleção pelo novo texto.
  // Isso é exatamente o que um usuário faria com Ctrl+A + Paste.

  const client = await page.target().createCDPSession();
  const inp = await page.$(sel);
  await inp.click();
  await new Promise(r => setTimeout(r, 200));

  // Seleciona todo o conteúdo do input (via JS, mais confiável que triple-click)
  await page.evaluate((s: string) => {
    const i = document.querySelector(s) as HTMLInputElement;
    i.focus();
    i.select();
    i.setSelectionRange(0, i.value.length);
  }, sel);
  await new Promise(r => setTimeout(r, 200));

  // Insere o novo texto via CDP — substitui o conteúdo selecionado
  // (Input.insertText simula colar/digitar nativamente, dispara todos os eventos)
  await client.send('Input.insertText', { text: newUrl });
  await new Promise(r => setTimeout(r, 500));

  await client.detach().catch(() => {});

  // 4. Confirma valor
  const valorAgora = await page.evaluate((s: string) => (document.querySelector(s) as HTMLInputElement)?.value || '', sel);
  if (valorAgora !== newUrl) {
    console.warn(`[Clouddy] ${label} - ⚠️ valor divergente após digitar:`);
    console.warn(`  esperado: "${newUrl}"`);
    console.warn(`  atual:    "${valorAgora}"`);
    return false;
  }
  console.log(`[Clouddy] ${label} - ✅ campo substituído: "${valorAgora}"`);

  // 5. Tira foco para garantir que o change foi commitado pelo Yii
  await page.evaluate((s: string) => (document.querySelector(s) as HTMLInputElement)?.blur(), sel);
  await new Promise(r => setTimeout(r, 800));

  // 6. DEBUG: verifica o estado do form ANTES de salvar
  const formState = await page.evaluate((s: string) => {
    const inp = document.querySelector(s) as HTMLInputElement;
    const form = inp?.closest('form');
    return {
      inputValue: inp?.value,
      inputAttrValue: inp?.getAttribute('value'),
      inputDefaultValue: inp?.defaultValue,
      formAction: form?.action,
      formMethod: form?.method,
      hasYiiActiveForm: !!(window as any).yii?.activeForm,
    };
  }, sel);
  console.log(`[Clouddy] ${label} - estado pré-save:`, JSON.stringify(formState, null, 2));

  // 7. SUBMETE via fetch() POST com FormData — bypassa qualquer issue do submit nativo.
  // O Clouddy aceita o form-data porque é o enctype configurado no <form>.
  const submitResult = await page.evaluate(async (s: string) => {
    const inp = document.querySelector(s) as HTMLInputElement;
    const form = inp?.closest('form') as HTMLFormElement;
    if (!form) return { ok: false, error: 'no-form' };

    // Constrói FormData manualmente pegando todos os inputs do form
    // (o construtor FormData(form) usa defaultValue para inputs file/text,
    // o que é o bug que estamos enfrentando)
    const fd = new FormData();
    form.querySelectorAll('input, textarea, select').forEach((el: any) => {
      if (!el.name) return;
      if (el.type === 'file') {
        // Não inclui input file vazio
        if (el.files && el.files.length > 0) {
          for (const f of el.files) fd.append(el.name, f);
        }
        return;
      }
      // Pega o VALOR ATUAL (não o defaultValue)
      fd.append(el.name, el.value);
    });

    // POST via fetch usando a action do form
    try {
      const resp = await fetch(form.action || window.location.href, {
        method: 'POST',
        body: fd,
        credentials: 'include',
        redirect: 'follow',
      });
      return { ok: resp.ok, status: resp.status, finalUrl: resp.url };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }, sel);

  console.log(`[Clouddy] ${label} - submit fetch:`, JSON.stringify(submitResult));
  await new Promise(r => setTimeout(r, 1500));

  return submitResult.ok === true;
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
