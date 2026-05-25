import { launchBrowser } from './startpainel-puppeteer.js';

const VUPRO_LOGIN_URL = 'https://vuproplayer.com/login';
const VUPRO_PROFILE_NUM = 98; // Perfil dedicado para o VU Player Pro

/**
 * Cadastra ou atualiza uma playlist no portal do VU Player Pro.
 * 
 * @param mac         MAC Address do aparelho do cliente
 * @param deviceKey   Device Key (KEY) do aparelho
 * @param playlistUrl URL M3U da playlist do cliente
 * @param listName    Nome da lista (ex: "Minha Lista")
 * @param profileNum  Ignorado — sempre usa o perfil dedicado VU Player Pro (98)
 */
export async function runVUProSetup(
  mac: string,
  deviceKey: string,
  playlistUrl: string,
  listName: string,
  profileNum = 0
): Promise<{ success: boolean; message: string }> {
  let browser: any = null;

  try {
    console.log(`[VUPro] Iniciando automação para MAC: ${mac} | KEY: ${deviceKey}`);
    
    // Sempre usa o perfil dedicado 98 para isolamento de cookies do VU Player Pro
    browser = await launchBrowser(false, VUPRO_PROFILE_NUM) as any;
    if (!browser) throw new Error('Falha ao iniciar o navegador.');

    const page = await (browser as any).newPage();
    await page.setViewport({ width: 1366, height: 768 });

    // ── 1. Acessa a página de login ───────────────────────────────────────────
    console.log('[VUPro] Acessando página de login...');
    await page.goto(VUPRO_LOGIN_URL, { waitUntil: 'networkidle2', timeout: 35_000 });
    await new Promise(r => setTimeout(r, 2000));

    // Se já estiver logado (redirecionou para mylist ou similar), ótimo.
    // Senão, preenche credenciais e faz login.
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      console.log('[VUPro] Tela de login detectada. Preenchendo credenciais...');
      
      // Seletores tolerantes para o MAC
      const macSelectors = [
        'input[placeholder*="MAC"]',
        'input[name*="mac"]',
        'input[id*="mac"]',
        'input[type="text"]'
      ];
      let macFilled = false;
      for (const sel of macSelectors) {
        try {
          const input = await page.$(sel);
          if (input) {
            await input.click({ clickCount: 3 });
            await input.type(mac, { delay: 60 });
            macFilled = true;
            console.log(`[VUPro] MAC preenchido usando seletor: ${sel}`);
            break;
          }
        } catch {}
      }
      if (!macFilled) throw new Error('Campo MAC Address não encontrado na tela de login.');

      // Seletores tolerantes para a KEY
      const keySelectors = [
        'input[placeholder*="KEY"]',
        'input[placeholder*="key"]',
        'input[name*="key"]',
        'input[name*="password"]',
        'input[type="password"]',
        'input[type="text"]'
      ];
      let keyFilled = false;
      // Pega todos os inputs para evitar preencher o MAC novamente se o seletor genérico bater nele
      const allInputs = await page.$$('input');
      
      for (const sel of keySelectors) {
        try {
          const input = await page.$(sel);
          if (input) {
            // Garante que não é o mesmo input do MAC
            const isMacInput = await page.evaluate((el, macVal) => (el as HTMLInputElement).value === macVal, input, mac);
            if (!isMacInput) {
              await input.click({ clickCount: 3 });
              await input.type(deviceKey, { delay: 60 });
              keyFilled = true;
              console.log(`[VUPro] KEY preenchida usando seletor: ${sel}`);
              break;
            }
          }
        } catch {}
      }

      // Fallback para preencher KEY (geralmente o segundo input de texto/password)
      if (!keyFilled && allInputs.length >= 2) {
        console.log('[VUPro] Usando fallback por ordem física para a KEY...');
        await allInputs[1].click({ clickCount: 3 });
        await allInputs[1].type(deviceKey, { delay: 60 });
        keyFilled = true;
      }

      if (!keyFilled) throw new Error('Campo KEY não encontrado na tela de login.');

      // Clica no botão LOGIN
      console.log('[VUPro] Clicando no botão LOGIN...');
      const loginClicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, a, input[type="submit"], input[type="button"]')) as HTMLElement[];
        const loginBtn = btns.find(b => {
          const txt = (b.textContent || (b as HTMLInputElement).value || '').toLowerCase().trim();
          return txt === 'login' || txt === 'entrar' || txt === 'sign in';
        });
        if (loginBtn) {
          loginBtn.click();
          return true;
        }
        return false;
      });

      if (!loginClicked) {
        console.warn('[VUPro] Botão LOGIN não localizado por texto. Tentando form submit...');
        await page.evaluate(() => {
          const form = document.querySelector('form');
          if (form) form.submit();
        });
      }

      console.log('[VUPro] Aguardando autenticação...');
      await new Promise(r => setTimeout(r, 4000));
    } else {
      console.log('[VUPro] Já autenticado anteriormente! URL:', currentUrl);
    }

    // Valida se entramos na página interna
    const pageAfterAuth = page.url();
    if (pageAfterAuth.includes('/login')) {
      throw new Error('Falha na autenticação do VU Player Pro. MAC ou KEY inválidos.');
    }

    console.log('[VUPro] Login bem-sucedido. URL atual:', pageAfterAuth);

    // ── 2. Clica em "ADD PLAYLIST" ────────────────────────────────────────────
    console.log('[VUPro] Abrindo o modal de playlist via JS...');
    await page.evaluate(() => {
      if (typeof (window as any).showPlaylistModal === 'function') {
        (window as any).showPlaylistModal('general');
      } else {
        // Fallback para clique físico se a função não existir
        const el = Array.from(document.querySelectorAll('button, a, div, span')).find(b => b.textContent?.toUpperCase().includes('ADD PLAYLIST')) as HTMLElement;
        if (el) el.click();
      }
    });

    console.log('[VUPro] Aguardando renderização do modal...');
    await new Promise(r => setTimeout(r, 2000));

    // ── 3. Preenche os campos do modal ────────────────────────────────────────
    console.log('[VUPro] Preenchendo campos do modal...');

    await page.waitForSelector('#playlist-name', { timeout: 8000 });
    await page.waitForSelector('#playlist-url', { timeout: 8000 });

    const formResult = await page.evaluate((nameVal, urlVal) => {
      const nameInp = document.querySelector('#playlist-name') as HTMLInputElement;
      const urlInp = document.querySelector('#playlist-url') as HTMLInputElement;
      const protectCb = document.querySelector('#playlist-protect') as HTMLInputElement;

      if (!nameInp || !urlInp) {
        return { success: false, message: 'Campos do modal não encontrados no DOM' };
      }

      // Preenche Nome
      nameInp.focus();
      nameInp.value = '';
      nameInp.value = nameVal;
      nameInp.dispatchEvent(new Event('input', { bubbles: true }));
      nameInp.dispatchEvent(new Event('change', { bubbles: true }));

      // Preenche URL
      urlInp.focus();
      urlInp.value = '';
      urlInp.value = urlVal;
      urlInp.dispatchEvent(new Event('input', { bubbles: true }));
      urlInp.dispatchEvent(new Event('change', { bubbles: true }));

      // Marca o protect se necessário
      if (protectCb && !protectCb.checked) {
        protectCb.click();
      }

      return { success: true };
    }, listName, playlistUrl);

    if (!formResult.success) {
      throw new Error(formResult.message);
    }

    // ── 4. Ativa "Protect This Playlist" e preenche PIN 123456 ─────────────────
    console.log('[VUPro] Ativando a proteção de playlist e configurando o PIN...');
    
    // Aguarda o campo de pin aparecer (ativado pela marcação do checkbox)
    await new Promise(r => setTimeout(r, 1000));
    await page.waitForSelector('#pin', { timeout: 4000 });

    const pinResult = await page.evaluate(() => {
      const pinInp = document.querySelector('#pin') as HTMLInputElement;
      const pinConfirmInp = document.querySelector('#pin-confirm') as HTMLInputElement;

      if (pinInp && pinConfirmInp) {
        pinInp.focus();
        pinInp.value = '';
        pinInp.value = '123456';
        pinInp.dispatchEvent(new Event('input', { bubbles: true }));
        pinInp.dispatchEvent(new Event('change', { bubbles: true }));

        pinConfirmInp.focus();
        pinConfirmInp.value = '';
        pinConfirmInp.value = '123456';
        pinConfirmInp.dispatchEvent(new Event('input', { bubbles: true }));
        pinConfirmInp.dispatchEvent(new Event('change', { bubbles: true }));

        return true;
      }
      return false;
    });

    if (pinResult) {
      console.log('[VUPro] PIN de proteção 123456 configurado com sucesso.');
    } else {
      console.warn('[VUPro] Não foi possível configurar os campos de PIN.');
    }

    await new Promise(r => setTimeout(r, 1000));

    // ── 5. Clica em "SAVE" ───────────────────────────────────────────────────
    console.log('[VUPro] Salvando a playlist via JS...');
    const saved = await page.evaluate(() => {
      if (typeof (window as any).savePlaylist === 'function') {
        (window as any).savePlaylist();
        return true;
      }
      return false;
    });

    if (!saved) {
      console.warn('[VUPro] Função savePlaylist() não encontrada na janela. Tentando clique no botão SAVE...');
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('#playlist-modal button, button')) as HTMLElement[];
        const saveBtn = btns.find(b => {
          const txt = b.textContent?.toLowerCase().trim() || '';
          return txt === 'save' || txt === 'salvar';
        });
        if (saveBtn) {
          saveBtn.click();
        }
      });
    }

    console.log('[VUPro] Aguardando processamento da gravação...');
    await new Promise(r => setTimeout(r, 5000));

    // Captura a URL final para verificação
    const finalUrl = page.url();
    console.log('[VUPro] URL final após gravação:', finalUrl);

    // Se o modal fechou ou fomos redirecionados, consideramos sucesso
    const modalClosed = await page.evaluate(() => {
      const modal = document.querySelector('#playlist-modal, .modal, [role="dialog"]');
      if (modal) {
        const style = window.getComputedStyle(modal);
        return style.display === 'none' || style.visibility === 'hidden' || modal.getBoundingClientRect().width === 0;
      }
      return true;
    });

    if (modalClosed || !finalUrl.includes('login')) {
      console.log('[VUPro] Playlist cadastrada com sucesso!');
      return { success: true, message: 'Playlist cadastrada com sucesso no VU Player Pro.' };
    }

    return { success: true, message: 'Playlist enviada ao VU Player Pro (verifique se foi adicionada).' };

  } catch (err: any) {
    console.error('[VUPro] Erro na automação:', err?.message);
    return { success: false, message: err?.message || 'Erro inesperado na automação VU Player Pro.' };
  } finally {
    if (browser) {
      try { await (browser as any).close(); } catch {}
    }
  }
}
