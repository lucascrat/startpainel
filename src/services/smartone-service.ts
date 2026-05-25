import { launchBrowser } from './startpainel-puppeteer.js';

const SMARTONE_LOGIN_URL    = 'https://smartone-iptv.com/client/login';
const SMARTONE_PLAYLIST_URL = 'https://smartone-iptv.com/plugin/smart_one/client_main/add_playlist/';
const SMARTONE_USER         = 'lrsousadesenvolvedor@gmail.com';
const SMARTONE_PASS         = '01Deus02@';

// Perfil dedicado para SmartOne (não compartilhado com os 5 perfis paralelos)
const SMARTONE_PROFILE_NUM  = 99;

/**
 * Abre o browser visivelmente, preenche as credenciais e espera o usuário
 * clicar em "Log In" manualmente (o Turnstile do Cloudflare exige interação
 * humana real — automatizável após esta autenticação inicial).
 *
 * Retorna sucesso assim que login for detectado (até 3 minutos).
 */
export async function initSmartOneSession(): Promise<{ success: boolean; message: string }> {
  let browser: any = null;
  try {
    console.log('[SmartOne Init] Abrindo browser para autenticação manual...');
    browser = await launchBrowser(false, SMARTONE_PROFILE_NUM) as any;
    if (!browser) throw new Error('Falha ao iniciar o navegador.');

    const page = await (browser as any).newPage();
    await page.setViewport({ width: 1366, height: 768 });

    await page.goto(SMARTONE_LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30_000 });
    await new Promise(r => setTimeout(r, 2500));

    // Se já está logado, ótimo
    if (!page.url().includes('/login')) {
      console.log('[SmartOne Init] Já autenticado! URL:', page.url());
      return { success: true, message: 'SmartOne já está autenticado! Sessão válida.' };
    }

    // Preenche credenciais automaticamente (usuário só precisa clicar em Log In)
    const userSel = '#login_username, input[name="username"]';
    const passSel = '#login_password, input[type="password"]';

    await page.waitForSelector(userSel, { visible: true, timeout: 10_000 });
    await page.click(userSel, { clickCount: 3 });
    await page.type(userSel, SMARTONE_USER, { delay: 80 });
    await page.click(passSel, { clickCount: 3 });
    await page.type(passSel, SMARTONE_PASS, { delay: 80 });

    console.log('[SmartOne Init] Credenciais preenchidas.');
    console.log('[SmartOne Init] *** AÇÃO NECESSÁRIA: Clique em "Log In" no browser aberto. ***');
    console.log('[SmartOne Init] Aguardando login por até 3 minutos...');

    // Aguarda o usuário clicar Log In e o Turnstile passar
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 2000));
      const currentUrl = page.url();
      if (!currentUrl.includes('/login')) {
        console.log('[SmartOne Init] Login detectado! URL:', currentUrl);
        await (browser as any).close();
        browser = null;
        return { success: true, message: 'Sessão SmartOne autenticada com sucesso! Automações prontas.' };
      }
    }

    return { success: false, message: 'Timeout: aguardou 3 minutos mas o login não foi realizado.' };

  } catch (err: any) {
    console.error('[SmartOne Init] Erro:', err?.message);
    return { success: false, message: err?.message || 'Erro ao iniciar sessão SmartOne.' };
  } finally {
    if (browser) {
      try { await (browser as any).close(); } catch {}
    }
  }
}

/**
 * Adiciona uma playlist no painel SmartOne para o cliente.
 * Requer que a sessão tenha sido autenticada previamente via initSmartOneSession().
 *
 * @param mac         MAC address do aparelho do cliente
 * @param listName    Nome da lista que aparecerá no app do cliente
 * @param playlistUrl URL M3U da lista do cliente
 * @param profileNum  Ignorado — sempre usa o perfil dedicado SmartOne (99)
 */
export async function runSmartOneSetup(
  mac: string,
  listName: string,
  playlistUrl: string,
  profileNum = 0
): Promise<{ success: boolean; message: string }> {
  let browser: any = null;

  try {
    // Sempre usa o perfil dedicado SmartOne para reutilizar a sessão
    browser = await launchBrowser(false, SMARTONE_PROFILE_NUM) as any;
    if (!browser) throw new Error('Falha ao iniciar o navegador.');

    const page = await (browser as any).newPage();
    await page.setViewport({ width: 1366, height: 768 });

    // ── 1. Tenta acessar a página de playlist diretamente (usando sessão salva) ──
    console.log('[SmartOne] Acessando página de adicionar playlist...');
    await page.goto(SMARTONE_PLAYLIST_URL, { waitUntil: 'networkidle2', timeout: 25_000 });
    await new Promise(r => setTimeout(r, 1500));

    const pageAfterNav = page.url();

    // Se não chegou na página de add_playlist (redirecionou pra login ou home)
    // → sessão não autenticada ou expirada
    if (!pageAfterNav.includes('add_playlist')) {
      console.warn('[SmartOne] Sessão não autenticada — redirecionou para:', pageAfterNav);
      return {
        success: false,
        message: 'Sessão SmartOne não autenticada. Acesse o painel admin e clique em "Autenticar SmartOne" para fazer o login manual (uma vez só).',
      };
    }

    console.log('[SmartOne] Página de playlist carregada. URL:', pageAfterNav);

    // ── 2. Seleciona a aba "M3u NORMAL" ────────────────────────────────────────
    console.log('[SmartOne] Selecionando aba M3u NORMAL...');
    const m3uTabClicked = await page.evaluate(() => {
      const tab = document.querySelector<HTMLElement>('a[href="#m3u_playlist"], a[data-toggle="tab"][href*="m3u"]');
      if (tab) { tab.click(); return true; }
      return false;
    });
    if (m3uTabClicked) {
      await new Promise(r => setTimeout(r, 800));
      console.log('[SmartOne] Aba M3u NORMAL selecionada.');
    } else {
      console.warn('[SmartOne] Aba M3u NORMAL não encontrada — usando aba ativa por padrão.');
    }

    // ── 3. Preenche o formulário ────────────────────────────────────────────────
    console.log('[SmartOne] Preenchendo formulário...');
    const filled = { mac: false, name: false, url: false };

    // Campo MAC — placeholder "11:AA:CC:AA:EE:00"
    const macHandles = [
      await page.$('#m3u_playlist input[placeholder*="AA:CC"]'),
      await page.$('input[placeholder*="AA:CC"]'),
      await page.$('input[placeholder*="aa:cc"]'),
    ];
    const macField = macHandles.find(h => h !== null) ?? null;
    if (macField) {
      await macField.click({ clickCount: 3 });
      await macField.type(mac, { delay: 60 });
      filled.mac = true;
      console.log('[SmartOne] MAC preenchido.');
    }

    // Campo Nome — placeholder "Vip List"
    const nameHandles = [
      await page.$('#m3u_playlist input[placeholder="Vip List"]'),
      await page.$('input[placeholder="Vip List"]'),
    ];
    const nameField = nameHandles.find(h => h !== null) ?? null;
    if (nameField) {
      await nameField.click({ clickCount: 3 });
      await nameField.type(listName, { delay: 60 });
      filled.name = true;
      console.log('[SmartOne] Nome da lista preenchido.');
    }

    // Campo URL M3U — placeholder contém "get.php" ou "m3u"
    const urlHandles = [
      await page.$('#m3u_playlist input[placeholder*="get.php"]'),
      await page.$('input[placeholder*="get.php"]'),
      await page.$('#m3u_playlist input[placeholder*="m3u"]'),
      await page.$('input[placeholder*="m3u"]'),
    ];
    const urlField = urlHandles.find(h => h !== null) ?? null;
    if (urlField) {
      await urlField.click({ clickCount: 3 });
      await urlField.type(playlistUrl, { delay: 20 });
      filled.url = true;
      console.log('[SmartOne] URL M3U preenchida.');
    }

    // Fallback: se algum campo não foi preenchido, usa posição
    if (!filled.mac || !filled.name || !filled.url) {
      console.log('[SmartOne] Fallback por posição. Campos preenchidos:', filled);
      const allText = await page.$$('input[type="text"]:not([type="hidden"])');
      const visible: any[] = [];
      for (const inp of allText) {
        const box = await inp.boundingBox();
        if (box && box.width > 0 && box.height > 0) {
          const attrs = await page.evaluate((el: any) => ({
            ph: el.placeholder, name: el.name, id: el.id,
          }), inp);
          console.log(`[SmartOne] Visible input: ph="${attrs.ph}" name="${attrs.name}" id="${attrs.id}"`);
          visible.push(inp);
        }
      }
      if (!filled.mac && visible[0]) {
        await visible[0].click({ clickCount: 3 });
        await visible[0].type(mac, { delay: 60 });
        console.log('[SmartOne] MAC preenchido por posição [0].');
      }
      if (!filled.name && visible[1]) {
        await visible[1].click({ clickCount: 3 });
        await visible[1].type(listName, { delay: 60 });
        console.log('[SmartOne] Nome preenchido por posição [1].');
      }
      if (!filled.url && visible[2]) {
        await visible[2].click({ clickCount: 3 });
        await visible[2].type(playlistUrl, { delay: 20 });
        console.log('[SmartOne] URL preenchida por posição [2].');
      }
    }

    await new Promise(r => setTimeout(r, 1000));

    // ── 4. Clica em "Add Playlist" ───────────────────────────────────────────────
    console.log('[SmartOne] Clicando em Add Playlist...');
    const clicked = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(
        'button[type="submit"], input[type="submit"], button'
      ));
      for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const txt = (el.textContent || (el as HTMLInputElement).value || '').toLowerCase().trim();
        if (txt.includes('add') || txt.includes('save') || txt.includes('submit') || txt.includes('adicionar') || txt.includes('salvar')) {
          el.click();
          return txt;
        }
      }
      // Qualquer submit visível
      for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && (el as HTMLButtonElement).type === 'submit') {
          el.click();
          return 'submit-fallback';
        }
      }
      return null;
    });

    if (!clicked) {
      console.warn('[SmartOne] Botão não encontrado — tentando form.submit().');
      await page.evaluate(() => { const f = document.querySelector('form'); if (f) f.submit(); });
    } else {
      console.log('[SmartOne] Clicou em botão:', clicked);
    }

    await new Promise(r => setTimeout(r, 4000));

    // ── 5. Verifica resultado ────────────────────────────────────────────────────
    const finalUrl = page.url();
    console.log('[SmartOne] URL final após submit:', finalUrl);

    // Redirecionou para a lista de playlists → sucesso
    if (finalUrl.includes('/client_main/') && !finalUrl.includes('add_playlist')) {
      console.log('[SmartOne] Redirecionado para lista de playlists — sucesso!');
      return { success: true, message: 'Playlist adicionada no SmartOne com sucesso.' };
    }

    const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
    const successWords = ['success', 'added', 'adicionada', 'criada', 'salvo', 'saved'];
    const errorWords   = ['error', 'erro', 'invalid', 'failed', 'fail', 'already exists', 'já existe'];

    if (successWords.some(w => bodyText.includes(w))) {
      console.log('[SmartOne] Sinal de sucesso detectado na página.');
      return { success: true, message: 'Playlist adicionada no SmartOne com sucesso.' };
    }
    if (errorWords.some(w => bodyText.includes(w))) {
      console.warn('[SmartOne] Sinal de erro na página:', bodyText.slice(0, 200));
      return { success: false, message: 'Erro ao adicionar playlist no SmartOne.' };
    }

    // Sem sinal claro — considera enviado
    console.log('[SmartOne] Submit realizado sem sinal de erro.');
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
