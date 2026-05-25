import { launchBrowser } from './startpainel-puppeteer.js';

const SMARTONE_LOGIN_URL    = 'https://smartone-iptv.com/client/login';
const SMARTONE_PLAYLIST_URL = 'https://smartone-iptv.com/plugin/smart_one/client_main/add_playlist/';
const SMARTONE_USER         = 'lrsousadesenvolvedor@gmail.com';
const SMARTONE_PASS         = '01Deus02@';

/**
 * Adiciona uma playlist no painel SmartOne para o cliente.
 *
 * @param mac         MAC address do aparelho do cliente
 * @param listName    Nome da lista que aparecerá no app do cliente
 * @param playlistUrl URL M3U da lista do cliente (playlist_url do sistema)
 * @param profileNum  Índice do perfil Chromium (para paralelismo)
 */
export async function runSmartOneSetup(
  mac: string,
  listName: string,
  playlistUrl: string,
  profileNum = 0
): Promise<{ success: boolean; message: string }> {
  let browser: any = null;

  try {
    browser = await launchBrowser(false, profileNum) as any;
    if (!browser) throw new Error('Falha ao iniciar o navegador.');

    const page = await (browser as any).newPage();
    await page.setViewport({ width: 1366, height: 768 });

    // ── 1. Login ────────────────────────────────────────────────────────────
    console.log('[SmartOne] Acessando página de login...');
    await page.goto(SMARTONE_LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30_000 });
    await new Promise(r => setTimeout(r, 2000));

    // Preenche e-mail
    const emailInput = await page.$('input[type="email"], input[name="email"], input[name="username"], input#email, input#username');
    if (!emailInput) throw new Error('Campo de e-mail não encontrado na página de login.');
    await emailInput.click({ clickCount: 3 });
    await emailInput.type(SMARTONE_USER, { delay: 80 });

    // Preenche senha
    const passInput = await page.$('input[type="password"], input[name="password"], input#password');
    if (!passInput) throw new Error('Campo de senha não encontrado na página de login.');
    await passInput.click({ clickCount: 3 });
    await passInput.type(SMARTONE_PASS, { delay: 80 });

    // Submete o formulário
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20_000 }).catch(() => {}),
      page.keyboard.press('Enter'),
    ]);
    await new Promise(r => setTimeout(r, 2000));

    // Verifica se logou (URL mudou ou elemento de dashboard presente)
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      // Tenta clicar no botão de submit explicitamente
      const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
      if (submitBtn) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20_000 }).catch(() => {}),
          submitBtn.click(),
        ]);
        await new Promise(r => setTimeout(r, 2000));
      }
      if (page.url().includes('/login')) {
        throw new Error('Falha no login do SmartOne — verifique as credenciais.');
      }
    }
    console.log('[SmartOne] Login realizado com sucesso. URL:', page.url());

    // ── 2. Acessa a página de adicionar playlist ────────────────────────────
    console.log('[SmartOne] Acessando página de adicionar playlist...');
    await page.goto(SMARTONE_PLAYLIST_URL, { waitUntil: 'networkidle2', timeout: 20_000 });
    await new Promise(r => setTimeout(r, 2000));

    // ── 3. Preenche o formulário ────────────────────────────────────────────
    console.log('[SmartOne] Preenchendo formulário de playlist...');

    // Localiza todos os inputs/textareas visíveis
    const inputs = await page.$$('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea');
    console.log(`[SmartOne] Encontrados ${inputs.length} campos de entrada.`);

    // Estratégia 1: tenta por placeholder/name/id conhecidos
    const filled = { mac: false, name: false, url: false };

    for (const input of inputs) {
      const attrs = await page.evaluate((el: any) => ({
        name:        el.name || '',
        id:          el.id || '',
        placeholder: el.placeholder || '',
        type:        el.type || '',
      }), input);

      const label = `${attrs.name} ${attrs.id} ${attrs.placeholder}`.toLowerCase();

      if (!filled.mac && (label.includes('mac') || label.includes('device'))) {
        await input.click({ clickCount: 3 });
        await input.type(mac, { delay: 60 });
        filled.mac = true;
        console.log('[SmartOne] MAC preenchido via atributo:', attrs.name || attrs.id || attrs.placeholder);
      } else if (!filled.name && (label.includes('name') || label.includes('nome') || label.includes('list'))) {
        await input.click({ clickCount: 3 });
        await input.type(listName, { delay: 60 });
        filled.name = true;
        console.log('[SmartOne] Nome da lista preenchido via atributo:', attrs.name || attrs.id || attrs.placeholder);
      } else if (!filled.url && (label.includes('url') || label.includes('link') || label.includes('playlist') || label.includes('m3u'))) {
        await input.click({ clickCount: 3 });
        await input.type(playlistUrl, { delay: 20 });
        filled.url = true;
        console.log('[SmartOne] URL preenchida via atributo:', attrs.name || attrs.id || attrs.placeholder);
      }
    }

    // Estratégia 2: fallback por posição se algum campo não foi preenchido
    if (!filled.mac || !filled.name || !filled.url) {
      console.log('[SmartOne] Fallback por posição. Campos faltando:', filled);
      const visibleInputs: any[] = [];
      for (const input of inputs) {
        const box = await input.boundingBox();
        if (box && box.width > 0 && box.height > 0) visibleInputs.push(input);
      }
      // Ordem esperada: [0]=MAC, [1]=Nome, [2]=URL (ou variações)
      if (!filled.mac && visibleInputs[0]) {
        await visibleInputs[0].click({ clickCount: 3 });
        await visibleInputs[0].type(mac, { delay: 60 });
        console.log('[SmartOne] MAC preenchido por posição [0].');
      }
      if (!filled.name && visibleInputs[1]) {
        await visibleInputs[1].click({ clickCount: 3 });
        await visibleInputs[1].type(listName, { delay: 60 });
        console.log('[SmartOne] Nome preenchido por posição [1].');
      }
      if (!filled.url && visibleInputs[2]) {
        await visibleInputs[2].click({ clickCount: 3 });
        await visibleInputs[2].type(playlistUrl, { delay: 20 });
        console.log('[SmartOne] URL preenchida por posição [2].');
      }
    }

    await new Promise(r => setTimeout(r, 1000));

    // ── 4. Clica em "Add Playlist" / "Adicionar" ────────────────────────────
    console.log('[SmartOne] Clicando no botão de adicionar playlist...');
    const clicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, input[type="submit"], a'));
      const btn = btns.find(b => {
        const t = (b.textContent || (b as HTMLInputElement).value || '').toLowerCase().trim();
        return t.includes('add') || t.includes('adicionar') || t.includes('save') || t.includes('salvar') || t.includes('submit');
      }) as HTMLElement | undefined;
      if (btn) { btn.click(); return true; }
      return false;
    });

    if (!clicked) {
      // Tenta submit do form diretamente
      await page.evaluate(() => {
        const form = document.querySelector('form');
        if (form) form.submit();
      });
    }

    await new Promise(r => setTimeout(r, 3000));

    // ── 5. Verifica sucesso ─────────────────────────────────────────────────
    const pageText = await page.evaluate(() => document.body.innerText.toLowerCase());
    const successSignals = ['success', 'added', 'adicionada', 'criada', 'playlist', 'salvo', 'ok'];
    const errorSignals   = ['error', 'erro', 'invalid', 'failed', 'fail'];

    const hasSuccess = successSignals.some(s => pageText.includes(s));
    const hasError   = errorSignals.some(s => pageText.includes(s));

    if (hasError && !hasSuccess) {
      console.warn('[SmartOne] Possível erro detectado na página após submit.');
      return { success: false, message: 'Erro ao adicionar playlist no SmartOne.' };
    }

    console.log('[SmartOne] Playlist adicionada com sucesso!');
    return { success: true, message: 'Playlist adicionada no SmartOne com sucesso.' };

  } catch (err: any) {
    console.error('[SmartOne] Erro na automação:', err?.message);
    return { success: false, message: err?.message || 'Erro inesperado na automação SmartOne.' };
  } finally {
    if (browser) {
      try { await (browser as any).close(); } catch {}
    }
  }
}
