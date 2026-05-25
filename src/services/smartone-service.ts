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
      console.log('[SmartOne] Tentando realizar login automático...');

      try {
        if (!page.url().includes('/login')) {
          await page.goto(SMARTONE_LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30_000 });
          await new Promise(r => setTimeout(r, 2000));
        }

        const userSel = '#login_username, input[name="username"]';
        const passSel = '#login_password, input[type="password"]';

        await page.waitForSelector(userSel, { visible: true, timeout: 15_000 });
        await page.click(userSel, { clickCount: 3 });
        await page.type(userSel, SMARTONE_USER, { delay: 80 });
        await page.click(passSel, { clickCount: 3 });
        await page.type(passSel, SMARTONE_PASS, { delay: 80 });

        console.log('[SmartOne] Credenciais preenchidas. Clicando em Log In...');

        // Clica no botão de login (tentando vários seletores possíveis para o botão submit/login)
        await page.evaluate(() => {
          const btn = document.querySelector('button[type="submit"], input[type="submit"], #login_btn, button.btn-primary');
          if (btn) {
            (btn as HTMLElement).click();
          } else {
            // Caso não ache seletor exato, tenta por texto
            const btns = Array.from(document.querySelectorAll('button, a, input[type="button"]'));
            const loginBtn = btns.find(b => {
              const text = (b.textContent || (b as HTMLInputElement).value || '').toLowerCase();
              return text.includes('log') || text.includes('entrar') || text.includes('sign') || text.includes('acessar');
            });
            if (loginBtn) (loginBtn as HTMLElement).click();
          }
        });

        console.log('[SmartOne] Aguardando autenticação e redirecionamento por até 20 segundos...');
        await new Promise(r => setTimeout(r, 5000)); // Espera inicial

        // Polling para verificar se o login foi bem sucedido
        const loginDeadline = Date.now() + 15_000;
        let loggedIn = false;
        while (Date.now() < loginDeadline) {
          if (page.url().includes('add_playlist') || page.url().includes('client_main') || !page.url().includes('/login')) {
            loggedIn = true;
            break;
          }
          await new Promise(r => setTimeout(r, 1000));
        }

        if (loggedIn) {
          console.log('[SmartOne] Login automático concluído com sucesso!');
          // Se não foi para a página de add_playlist automaticamente, navega até ela
          if (!page.url().includes('add_playlist')) {
            await page.goto(SMARTONE_PLAYLIST_URL, { waitUntil: 'networkidle2', timeout: 25_000 });
            await new Promise(r => setTimeout(r, 1500));
          }
        } else {
          console.warn('[SmartOne] Login automático falhou ou parou no Captcha.');
          return {
            success: false,
            message: 'Sessão SmartOne não autenticada e login automático falhou. Acesse o painel admin para fazer o login manual uma vez.'
          };
        }
      } catch (loginErr: any) {
        console.error('[SmartOne] Erro no login automático:', loginErr?.message);
        return {
          success: false,
          message: `Sessão SmartOne inativa e falha no login automático: ${loginErr?.message}`
        };
      }
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
    const formFields = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea')) as HTMLInputElement[];
      const visible = inputs.filter(i => i.offsetWidth > 0 && i.offsetHeight > 0);
      return visible.map(i => ({
        id: i.id,
        name: i.name,
        placeholder: i.placeholder || ''
      }));
    });

    console.log('[SmartOne] Inputs visíveis detectados:', formFields);

    // 1. Preenche o MAC (o input visível com id="mac" ou name="mac" ou placeholder contendo "11:AA")
    const macFieldInfo = formFields.find(f => f.id === 'mac' || f.name === 'mac' || f.placeholder.includes('AA:CC'));
    if (macFieldInfo) {
      const selector = macFieldInfo.id ? `input#${macFieldInfo.id}, textarea#${macFieldInfo.id}` : `input[name="${macFieldInfo.name}"], textarea[name="${macFieldInfo.name}"]`;
      const element = await page.evaluateHandle((sel) => {
        const matches = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
        return matches.find(i => (i.tagName === 'INPUT' || i.tagName === 'TEXTAREA') && i.offsetWidth > 0 && i.offsetHeight > 0) || null;
      }, selector);

      if (element) {
        const el = element.asElement();
        if (el) {
          await el.click({ clickCount: 3 });
          await el.type(mac, { delay: 60 });
          filled.mac = true;
          console.log('[SmartOne] MAC preenchido.');
        }
      }
    }

    // 2. Preenche o Nome da Lista (o input visível com id="m3u_name" ou name="m3u_name" ou placeholder contendo "Vip List")
    const nameFieldInfo = formFields.find(f => f.id === 'm3u_name' || f.name === 'm3u_name' || f.placeholder.includes('Vip List'));
    if (nameFieldInfo) {
      const selector = nameFieldInfo.id ? `input#${nameFieldInfo.id}, textarea#${nameFieldInfo.id}` : `input[name="${nameFieldInfo.name}"], textarea[name="${nameFieldInfo.name}"]`;
      const element = await page.evaluateHandle((sel) => {
        const matches = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
        return matches.find(i => (i.tagName === 'INPUT' || i.tagName === 'TEXTAREA') && i.offsetWidth > 0 && i.offsetHeight > 0) || null;
      }, selector);

      if (element) {
        const el = element.asElement();
        if (el) {
          await el.click({ clickCount: 3 });
          await el.type(listName, { delay: 60 });
          filled.name = true;
          console.log('[SmartOne] Nome da lista preenchido.');
        }
      }
    }

    // 3. Preenche a URL (o input visível com id="m3u_playlist" ou name="m3u_playlist" ou placeholder contendo "m3u" ou "get.php")
    const urlFieldInfo = formFields.find(f => f.id === 'm3u_playlist' || f.name === 'm3u_playlist' || f.placeholder.includes('m3u') || f.placeholder.includes('get.php'));
    if (urlFieldInfo) {
      const selector = urlFieldInfo.id ? `input#${urlFieldInfo.id}, textarea#${urlFieldInfo.id}` : `input[name="${urlFieldInfo.name}"], textarea[name="${urlFieldInfo.name}"]`;
      const element = await page.evaluateHandle((sel) => {
        const matches = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
        return matches.find(i => (i.tagName === 'INPUT' || i.tagName === 'TEXTAREA') && i.offsetWidth > 0 && i.offsetHeight > 0) || null;
      }, selector);

      if (element) {
        const el = element.asElement();
        if (el) {
          await el.click({ clickCount: 3 });
          await el.type(playlistUrl, { delay: 20 });
          filled.url = true;
          console.log('[SmartOne] URL M3U preenchida.');
        }
      }
    }

    // Fallback: se algum campo não foi preenchido, usa posição física dos inputs visíveis
    if (!filled.mac || !filled.name || !filled.url) {
      console.log('[SmartOne] Algum campo falhou. Rodando fallback absoluto por ordem física dos campos visíveis...', filled);
      
      const elementsHandle = await page.evaluateHandle(() => {
        const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea')) as HTMLInputElement[];
        return inputs.filter(i => i.offsetWidth > 0 && i.offsetHeight > 0);
      });
      
      const visibleCount = await page.evaluate((els: any) => els.length, elementsHandle);
      
      if (visibleCount >= 3) {
        const fieldsToFill = [
          { index: 0, val: mac, label: 'MAC (Fallback)' },
          { index: 1, val: listName, label: 'Nome (Fallback)' },
          { index: 2, val: playlistUrl, label: 'URL (Fallback)' }
        ];

        for (const item of fieldsToFill) {
          const handle = await page.evaluateHandle((els: any, idx: number) => els[idx], elementsHandle, item.index);
          const el = handle.asElement();
          if (el) {
            await el.click({ clickCount: 3 });
            await el.type(item.val, { delay: 40 });
            console.log(`[SmartOne] ${item.label} preenchido.`);
          }
        }
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
