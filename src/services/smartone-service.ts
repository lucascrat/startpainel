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
    await new Promise(r => setTimeout(r, 2500));

    // Se já está logado, redireciona para /client/ automaticamente
    if (!page.url().includes('/login')) {
      console.log('[SmartOne] Já está logado. URL:', page.url());
    } else {
      // Aguarda o campo de username estar visível
      console.log('[SmartOne] Preenchendo credenciais...');
      const usernameSelector = '#login_username, input[name="username"]';
      const passwordSelector = '#login_password, input[type="password"]';

      await page.waitForSelector(usernameSelector, { visible: true, timeout: 10_000 });

      // Preenche username
      await page.click(usernameSelector, { clickCount: 3 });
      await page.type(usernameSelector, SMARTONE_USER, { delay: 80 });

      // Preenche senha
      await page.click(passwordSelector, { clickCount: 3 });
      await page.type(passwordSelector, SMARTONE_PASS, { delay: 80 });

      // Aguarda o Cloudflare Turnstile completar (até 20s)
      console.log('[SmartOne] Aguardando Cloudflare Turnstile...');
      try {
        await page.waitForFunction(
          () => {
            const t = document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
            return !t || t.value.length > 0;
          },
          { timeout: 20_000 }
        );
        console.log('[SmartOne] Turnstile completado.');
      } catch {
        console.warn('[SmartOne] Turnstile não completou em 20s — tentando submeter assim mesmo.');
      }

      // Clica no botão de submit
      console.log('[SmartOne] Submetendo formulário de login...');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => {}),
        page.click('input[name="login"], button[type="submit"], input[type="submit"]'),
      ]);
      await new Promise(r => setTimeout(r, 2000));

      // Verifica se o login foi bem-sucedido
      const afterLoginUrl = page.url();
      if (afterLoginUrl.includes('/login')) {
        // Tenta pegar mensagem de erro da página
        const errMsg = await page.evaluate(() => {
          const alert = document.querySelector('.alert, .error, .msg-error, [class*="error"]');
          return alert ? alert.textContent?.trim() : '';
        }).catch(() => '');
        throw new Error(`Falha no login do SmartOne${errMsg ? ': ' + errMsg : ' — verifique as credenciais.'}`);
      }
    }

    console.log('[SmartOne] Login realizado com sucesso. URL:', page.url());

    // ── 2. Acessa a página de adicionar playlist ────────────────────────────
    console.log('[SmartOne] Acessando página de adicionar playlist...');
    await page.goto(SMARTONE_PLAYLIST_URL, { waitUntil: 'networkidle2', timeout: 20_000 });
    await new Promise(r => setTimeout(r, 1500));

    // Verifica se a página de playlist foi carregada
    const playlistPageUrl = page.url();
    if (!playlistPageUrl.includes('add_playlist')) {
      throw new Error(`Falha ao acessar página de playlist. URL atual: ${playlistPageUrl}`);
    }

    // ── 3. Seleciona a aba "M3u NORMAL" ────────────────────────────────────
    console.log('[SmartOne] Selecionando aba M3u NORMAL...');
    const m3uTabClicked = await page.evaluate(() => {
      const tab = document.querySelector<HTMLElement>('a[href="#m3u_playlist"], a[data-toggle="tab"][href*="m3u"]');
      if (tab) { tab.click(); return true; }
      return false;
    });
    if (m3uTabClicked) {
      console.log('[SmartOne] Aba M3u NORMAL selecionada.');
      await new Promise(r => setTimeout(r, 800));
    } else {
      console.warn('[SmartOne] Aba M3u NORMAL não encontrada — usando tab ativa por padrão.');
    }

    // ── 4. Preenche o formulário ────────────────────────────────────────────
    console.log('[SmartOne] Preenchendo formulário de playlist...');

    // Estratégia 1: por placeholder conhecido (campos do M3u NORMAL)
    const filled = { mac: false, name: false, url: false };

    // Campo MAC — placeholder: "11:AA:CC:AA:EE:00"
    const macFieldHandle = await page.$('#m3u_playlist input[placeholder*="AA:CC"]')
      ?? await page.$('input[placeholder*="AA:CC"]')
      ?? await page.$('input[placeholder*="aa:cc"]');
    if (macFieldHandle) {
      await macFieldHandle.click({ clickCount: 3 });
      await macFieldHandle.type(mac, { delay: 60 });
      filled.mac = true;
      console.log('[SmartOne] MAC preenchido via placeholder.');
    }

    // Campo Nome — placeholder: "Vip List"
    const nameFieldHandle = await page.$('#m3u_playlist input[placeholder="Vip List"]')
      ?? await page.$('input[placeholder="Vip List"]');
    if (nameFieldHandle) {
      await nameFieldHandle.click({ clickCount: 3 });
      await nameFieldHandle.type(listName, { delay: 60 });
      filled.name = true;
      console.log('[SmartOne] Nome da lista preenchido via placeholder.');
    }

    // Campo URL — placeholder contém "get.php" ou "m3u"
    const urlFieldHandle = await page.$('#m3u_playlist input[placeholder*="get.php"]')
      ?? await page.$('input[placeholder*="get.php"]')
      ?? await page.$('#m3u_playlist input[placeholder*="m3u"]')
      ?? await page.$('input[placeholder*="m3u"]');
    if (urlFieldHandle) {
      await urlFieldHandle.click({ clickCount: 3 });
      await urlFieldHandle.type(playlistUrl, { delay: 20 });
      filled.url = true;
      console.log('[SmartOne] URL M3U preenchida via placeholder.');
    }

    // Estratégia 2: fallback por posição nos inputs visíveis do tab ativo
    if (!filled.mac || !filled.name || !filled.url) {
      console.log('[SmartOne] Fallback por posição. Campos faltando:', filled);

      // Pega inputs visíveis dentro do painel ativo
      const allInputs = await page.$$('input[type="text"]:not([type="hidden"])');
      const visibleInputs: any[] = [];
      for (const inp of allInputs) {
        const box = await inp.boundingBox();
        if (box && box.width > 0 && box.height > 0) visibleInputs.push(inp);
      }

      console.log(`[SmartOne] ${visibleInputs.length} inputs visíveis encontrados para fallback.`);

      // Loga atributos dos inputs encontrados para debug
      for (let i = 0; i < visibleInputs.length; i++) {
        const attrs = await page.evaluate((el: any) => ({
          placeholder: el.placeholder, name: el.name, id: el.id
        }), visibleInputs[i]);
        console.log(`[SmartOne] Input[${i}]:`, attrs);
      }

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

    // ── 5. Clica em "Add Playlist" ─────────────────────────────────────────
    console.log('[SmartOne] Clicando no botão Add Playlist...');
    const submitClicked = await page.evaluate(() => {
      // Procura botão submit visível no tab ativo ou no form
      const btns = Array.from(document.querySelectorAll<HTMLElement>('button[type="submit"], input[type="submit"], button'));
      for (const btn of btns) {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const text = (btn.textContent || (btn as HTMLInputElement).value || '').toLowerCase().trim();
          if (text.includes('add') || text.includes('save') || text.includes('submit') || text.includes('adicionar') || text.includes('salvar')) {
            btn.click();
            return true;
          }
        }
      }
      // Fallback: clica em qualquer botão submit visível
      for (const btn of btns) {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && (btn as HTMLButtonElement).type === 'submit') {
          btn.click();
          return true;
        }
      }
      return false;
    });

    if (!submitClicked) {
      console.warn('[SmartOne] Botão não encontrado — tentando submit direto do form.');
      await page.evaluate(() => {
        const form = document.querySelector('form');
        if (form) form.submit();
      });
    }

    await new Promise(r => setTimeout(r, 4000));

    // ── 6. Verifica sucesso ─────────────────────────────────────────────────
    const finalUrl = page.url();
    console.log('[SmartOne] URL após submit:', finalUrl);

    const pageText = await page.evaluate(() => document.body.innerText.toLowerCase());
    const successSignals = ['success', 'added', 'adicionada', 'criada', 'playlist added', 'salvo', 'saved'];
    const errorSignals   = ['error', 'erro', 'invalid', 'failed', 'fail', 'already exists', 'já existe'];

    const hasSuccess = successSignals.some(s => pageText.includes(s));
    const hasError   = errorSignals.some(s => pageText.includes(s));

    // Se a URL mudou para a lista de playlists, é sucesso
    if (finalUrl.includes('/client_main/') && !finalUrl.includes('add_playlist')) {
      console.log('[SmartOne] Redirecionado para lista de playlists — sucesso!');
      return { success: true, message: 'Playlist adicionada no SmartOne com sucesso.' };
    }

    if (hasError && !hasSuccess) {
      console.warn('[SmartOne] Erro detectado na página após submit. Texto:', pageText.slice(0, 300));
      return { success: false, message: 'Erro ao adicionar playlist no SmartOne.' };
    }

    if (hasSuccess) {
      console.log('[SmartOne] Playlist adicionada com sucesso!');
      return { success: true, message: 'Playlist adicionada no SmartOne com sucesso.' };
    }

    // Sem sinal claro — considera sucesso se não houve erro explícito
    console.log('[SmartOne] Submit realizado. Assumindo sucesso.');
    return { success: true, message: 'Playlist enviada ao SmartOne (verifique o painel se necessário).' };

  } catch (err: any) {
    console.error('[SmartOne] Erro na automação:', err?.message);
    return { success: false, message: err?.message || 'Erro inesperado na automação SmartOne.' };
  } finally {
    if (browser) {
      try { await (browser as any).close(); } catch {}
    }
  }
}
