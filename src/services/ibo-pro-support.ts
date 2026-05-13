
import { Browser, Page } from 'puppeteer-core';
import { launchBrowser, clickButtonByText } from './startpainel-puppeteer.js';

/**
 * Resolve o modal "Confirm Your PIN" do iboproapp.com.
 *
 * Por que era frágil antes:
 *   1. `page.keyboard.press('6')` por dígito perde input às vezes em inputs
 *      type=password — usar type() é mais confiável.
 *   2. Procura de botão "Ok" pegava qualquer elemento com "ok" no texto
 *      (inclusive "Cancel" se a página tivesse "Cookies", etc).
 *   3. Sem confirmação visual de que o modal abriu ou de que o PIN foi aceito.
 *
 * Como funciona agora:
 *   1. Aguarda o modal aparecer (texto "Confirm Your PIN") via waitForFunction
 *      — não fica polling cego com sleep.
 *   2. Acha o input visível dentro do modal/dialog ou no body (não em iframes
 *      — o ibopro usa modal Bootstrap no DOM principal).
 *   3. Foca + limpa + digita o PIN via .type() (Puppeteer simula keydown real).
 *   4. Acha o botão verde "Ok" (btn-success) DENTRO do mesmo modal, ou clica
 *      o button com texto exatamente "Ok"/"OK" (whitespace-trimmed).
 *   5. Espera o modal desaparecer (texto "Confirm Your PIN" sumir) com timeout.
 *
 * Retorna true se desbloqueou, false se modal não apareceu ou PIN foi rejeitado.
 */
export async function solvePinModal(page: Page, pin: string, opts: { timeoutMs?: number } = {}): Promise<boolean> {
  const timeout = opts.timeoutMs ?? 12_000;

  // 1) Aguarda o modal aparecer.
  // Usa waitForSelector + waitForFunction combinados: as vezes o modal aparece
  // como .modal.show antes do innerText conter o texto (race entre render e check).
  console.log(`[PIN] Aguardando modal "Confirm Your PIN" (timeout ${timeout}ms)...`);
  try {
    await page.waitForFunction(
      () => {
        // 1. Modal visivel (Bootstrap .modal.show ou dialog aberto)
        if (document.querySelector('.modal.show, [role="dialog"][aria-hidden="false"], .swal2-popup')) return true;
        // 2. Ou texto "Confirm Your PIN" no DOM (fallback)
        return /confirm your pin|pin is required/i.test(document.body.innerText);
      },
      { timeout, polling: 500 }
    );
  } catch {
    console.log('[PIN] Modal não apareceu no tempo limite. Salvando screenshot de debug...');
    try {
      const dbgPath = `c:\\Users\\hldes\\Desktop\\startpainel\\startpainel\\scratch\\pin_timeout_${Date.now()}.png`;
      await page.screenshot({ path: dbgPath, fullPage: true });
      console.log(`[PIN] Debug screenshot: ${dbgPath}`);
    } catch {}
    return false;
  }

  // 2) Acha o input do PIN — primeiro tenta dentro de .modal, depois .swal2-popup, depois body
  console.log('[PIN] Localizando input do PIN...');
  const inputSelectorChain = [
    '.modal.show input:not([type="hidden"])',     // Bootstrap modal aberto
    '.modal-dialog input:not([type="hidden"])',
    '[role="dialog"] input:not([type="hidden"])',
    '.swal2-input',                                 // SweetAlert2
    'input[type="password"]',                       // último recurso global
    'input[type="tel"]',
    'input[type="number"]',
  ];

  let inputHandle: any = null;
  for (const sel of inputSelectorChain) {
    inputHandle = await page.$(sel);
    if (inputHandle) {
      const visible = await inputHandle.evaluate((el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        const s = window.getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
      });
      if (visible) { console.log(`[PIN] Input encontrado via selector: ${sel}`); break; }
      inputHandle = null;
    }
  }
  if (!inputHandle) {
    console.error('[PIN] ❌ Nenhum input visível encontrado no modal.');
    return false;
  }

  // 3) Foca + limpa + digita
  console.log(`[PIN] Digitando PIN (${pin.length} dígitos)...`);
  await inputHandle.focus();
  await page.evaluate((el: HTMLInputElement) => { el.value = ''; }, inputHandle);
  await inputHandle.type(pin, { delay: 80 });
  await new Promise(r => setTimeout(r, 600));

  // 4) Clica em "Ok" — busca SÓ dentro do mesmo modal pra não pegar botões aleatórios
  console.log('[PIN] Procurando botão "Ok" no modal...');
  const clicked = await page.evaluate(() => {
    const modal = document.querySelector('.modal.show, .modal-dialog, [role="dialog"], .swal2-popup');
    const root: ParentNode = modal || document;
    const buttons = Array.from(root.querySelectorAll('button')) as HTMLButtonElement[];
    // Preferência: btn-success (verde do print) → texto exato "Ok"/"OK" → texto contém "ok" (não "cancel"/"close")
    const candidates = [
      buttons.find(b => b.className.split(/\s+/).includes('btn-success')),
      buttons.find(b => (b.textContent || '').trim().toLowerCase() === 'ok'),
      buttons.find(b => {
        const t = (b.textContent || '').toLowerCase();
        return t.includes('ok') && !t.includes('cancel') && !t.includes('close') && !t.includes('cook');
      }),
    ];
    const btn = candidates.find(Boolean);
    if (btn) { btn.click(); return true; }
    return false;
  });

  if (!clicked) {
    console.log('[PIN] Botão Ok não localizado — caindo no Enter.');
    await page.keyboard.press('Enter');
  } else {
    console.log('[PIN] ✅ Click no Ok enviado.');
  }

  // 5) Espera o modal desaparecer (= PIN aceito) — se voltar, PIN rejeitado
  try {
    await page.waitForFunction(
      () => !/confirm your pin|pin is required/i.test(document.body.innerText),
      { timeout: 6000 }
    );
    console.log('[PIN] ✅ Modal desbloqueado.');
    return true;
  } catch {
    console.error('[PIN] ❌ Modal continua aberto — PIN talvez incorreto ou click no Ok não funcionou.');
    return false;
  }
}

/**
 * Detecta se a pagina atual e a tela de login do iboproapp
 * (acontece quando a sessao expira ou o sistema desloga por conflito de MAC).
 */
async function isOnLoginPage(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    // Heuristicas combinadas pra ter alta confianca
    const txt = document.body.innerText.toLowerCase();
    const hasLoginTitle = txt.includes('login to add your playlist') || txt.includes('mac address') && txt.includes('device key');
    const hasMacInput = !!document.querySelector('input[placeholder*=":"][placeholder*="a"]'); // ex placeholder MAC
    const hasLoginBtn = Array.from(document.querySelectorAll('button')).some(b =>
      (b.textContent || '').trim().toUpperCase() === 'LOGIN'
    );
    return (hasLoginTitle || hasMacInput) && hasLoginBtn;
  });
}

/**
 * Faz re-login se a pagina atual e a tela de login.
 * Retorna true se desbloqueou (ou nem precisou), false se nao conseguiu sair de la.
 */
async function ensureLoggedIn(page: Page, mac: string, deviceKey: string): Promise<boolean> {
  if (!await isOnLoginPage(page)) return true;

  console.warn('[IBO Pro] ⚠️ Detectada tela de LOGIN no meio do fluxo. Refazendo login...');
  const inputs = await page.$$('input');
  if (inputs.length < 2) {
    console.error('[IBO Pro] Tela de login mas sem inputs?');
    return false;
  }

  await inputs[0].click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.keyboard.type(mac, { delay: 100 });
  await new Promise(r => setTimeout(r, 500));

  await inputs[1].click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.keyboard.type(deviceKey, { delay: 100 });
  await new Promise(r => setTimeout(r, 500));

  // Clica no LOGIN
  const loginBtnHandle = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('button, a'));
    return btns.find(b => (b.textContent || '').toUpperCase().includes('LOGIN'));
  });
  if (loginBtnHandle && loginBtnHandle.asElement()) {
    const box = await (loginBtnHandle.asElement() as any).boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }

  await new Promise(r => setTimeout(r, 5000));
  const stillOnLogin = await isOnLoginPage(page);
  if (stillOnLogin) {
    console.error('[IBO Pro] ❌ Re-login falhou — continua na tela de login');
    return false;
  }
  console.log('[IBO Pro] ✅ Re-login OK');
  return true;
}

/**
 * Verifica se o form de Edit (Update Playlist) esta visivel na tela —
 * inputs com placeholder/name relativos a Name/URL/m3u/Favorite.
 * Usado pra decidir se o PIN destrancou e abriu o form, ou se ainda
 * estamos travados.
 */
async function isEditFormVisible(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
    return inputs.some(i => {
      const visible = (i as HTMLElement).offsetParent !== null;
      if (!visible) return false;
      const p = (i.placeholder || '').toLowerCase();
      const n = (i.name || '').toLowerCase();
      return p.includes('favorite') || p.includes('m3u') || p.includes('name') ||
             p.includes('playlist name') || p.includes('url') ||
             n.includes('name') || n.includes('url');
    });
  });
}

/**
 * SERVIÇO DE SUPORTE AUTOMATIZADO IBO PRO
 * Site: https://iboproapp.com/
 */
export async function runIBOProAutomation(mac: string, deviceKey: string, playlistUrl: string) {
  let browser: Browser | null = null;
  const loginUrl = 'https://iboproapp.com/manage-playlists/login/';

  try {
    browser = await launchBrowser(false) as any;
    if (!browser) throw new Error('Falha ao iniciar navegador.');
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Habilita captura de console do navegador
    page.on('console', msg => {
      if (msg.text().includes('PIN Debug')) {
        console.log(`[Browser Console] ${msg.text()}`);
      }
    });

    console.log(`[IBO Pro] Acessando: ${loginUrl}`);
    await page.goto(loginUrl, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));

    console.log('[IBO Pro] Preenchendo credenciais...');
    const inputs = await page.$$('input');
    if (inputs.length >= 2) {
      // MAC
      await inputs[0].click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.keyboard.type(mac, { delay: 100 });
      
      await new Promise(r => setTimeout(r, 1000));

      // Key
      await inputs[1].click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.keyboard.type(deviceKey, { delay: 100 });
    }

    console.log('[IBO Pro] Clicando em LOGIN com Mouse físico...');
    const loginBtnHandle = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      return btns.find(b => b.textContent?.toUpperCase().includes('LOGIN') || b.textContent?.toUpperCase().includes('ENTRAR'));
    });

    if (loginBtnHandle && loginBtnHandle.asElement()) {
      const lBox = await (loginBtnHandle.asElement() as any).boundingBox();
      if (lBox) {
        await page.mouse.move(lBox.x + lBox.width / 2, lBox.y + lBox.height / 2);
        await page.mouse.click(lBox.x + lBox.width / 2, lBox.y + lBox.height / 2);
        console.log('[IBO Pro] LOGIN clicado via Coordenadas.');
      }
    } else {
      await clickButtonByText(page, ['LOGIN', 'Entrar']);
    }

    // Aguarda transição para o dashboard
    console.log('[IBO Pro] Aguardando dashboard...');
    await new Promise(r => setTimeout(r, 6000));

    // 2. DETECTAR SE JÁ EXISTE LISTA (Fluxo de Reparo vs Criação)
    console.log('[IBO Pro] Aguardando carregamento da tabela...');
    await new Promise(r => setTimeout(r, 4000));
    
    const editBtnHandle = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      // Só pega o botão se ele estiver visível e contiver o texto EDIT
      return btns.find(b => {
        const text = b.textContent?.toLowerCase().trim();
        const isVisible = (b as HTMLElement).offsetParent !== null;
        return text === 'edit' && isVisible;
      });
    });

    if (editBtnHandle && editBtnHandle.asElement()) {
      console.log('[IBO Pro] 🔧 Lista encontrada e visível! Iniciando REPARO (Edit)...');
      const box = await (editBtnHandle.asElement() as any).boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await new Promise(r => setTimeout(r, 4000));

        // Sessao pode ter caido (conflito de MAC com outro device, timeout).
        // Se voltou pra login, refaz e tenta de novo.
        if (!await ensureLoggedIn(page, mac, deviceKey)) {
          throw new Error('Sessao do iboproapp caiu e nao consegui re-logar.');
        }
        // Re-clica Edit apos re-login
        const reLoggedNow = await isOnLoginPage(page);
        if (!reLoggedNow) {
          // Se nao tava mais em login (ou ja era), garante que clicamos Edit
          await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const edit = btns.find(b => b.textContent?.toLowerCase().trim() === 'edit' && (b as HTMLElement).offsetParent !== null);
            if (edit) (edit as HTMLElement).click();
          });
          await new Promise(r => setTimeout(r, 3000));
        }

        // --- DESTRAVA DE PIN (helper isolado e testavel) ---
        const PIN_PROTECTED_PLAYLIST = '654321';

        // Tenta resolver o PIN. Timeout 20s — IBO Pro as vezes demora pra renderizar
        // o modal apos o click no Edit (~10-15s).
        let pinSolved = await solvePinModal(page, PIN_PROTECTED_PLAYLIST, { timeoutMs: 20_000 });

        // Se nao apareceu, pode ser que (a) lista nao tenha PIN, OU (b) modal demorou
        // muito e ja sumiu. Verifica se o form de edicao abriu. Senao, re-clica Edit
        // e tenta o PIN de novo.
        let editFormOpen = await isEditFormVisible(page);
        if (!pinSolved && !editFormOpen) {
          console.log('[IBO Pro] PIN nao apareceu E form nao abriu. Re-clicando Edit + nova tentativa de PIN...');
          await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const edit = btns.find(b => b.textContent?.toLowerCase().trim() === 'edit' && (b as HTMLElement).offsetParent !== null);
            if (edit) (edit as HTMLElement).click();
          });
          // 2a tentativa de resolver o PIN
          pinSolved = await solvePinModal(page, PIN_PROTECTED_PLAYLIST, { timeoutMs: 15_000 });
          editFormOpen = await isEditFormVisible(page);
        }

        // Se mesmo depois disso o form nao abriu, tenta um ultimo re-click no Edit
        // (pode ser lista sem PIN — o re-click as vezes destranca)
        if (!editFormOpen) {
          console.log('[IBO Pro] Form de edicao ainda nao visivel. Ultimo re-click no Edit...');
          await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const edit = btns.find(b => b.textContent?.toLowerCase().trim() === 'edit' && (b as HTMLElement).offsetParent !== null);
            if (edit) (edit as HTMLElement).click();
          });
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    } else {
      console.log('[IBO Pro] ✨ Nenhuma lista visível. Iniciando ADIÇÃO...');
      const addBtnHandle = await page.evaluateHandle(() => {
        const btns = Array.from(document.querySelectorAll('button, a'));
        return btns.find(b => {
          const text = b.textContent?.toLowerCase().trim();
          const isVisible = (b as HTMLElement).offsetParent !== null;
          return text === 'add playlist' && isVisible;
        });
      });

      if (addBtnHandle && addBtnHandle.asElement()) {
        const box = await (addBtnHandle.asElement() as any).boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        }
      } else {
        await clickButtonByText(page, ['Add Playlist']);
      }
    }
    
    // Aguarda o modal abrir e carregar campos
    await new Promise(r => setTimeout(r, 5000));
    const modalPath = `c:\\Users\\hldes\\Desktop\\startpainel\\startpainel\\scratch\\ibopro_modal_check_${Date.now()}.png`;
    await page.screenshot({ path: modalPath });
    console.log(`[IBO Pro] Debug do modal salvo: ${modalPath}`);

    // 3. PREENCHER FORMULARIO — sequencia ordenada pra cada estado da UI
    console.log('[IBO Pro] Localizando Name + URL...');

    // 3a. Pega coordenadas SO de Name e URL (sempre visiveis)
    const baseFields = await page.evaluate(() => {
      const allInputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
      const nameInp = allInputs.find(i => i.placeholder?.includes('Favorite') || i.placeholder?.includes('Name') || i.name?.includes('name'));
      const urlInp = allInputs.find(i => i.placeholder?.includes('m3u') || i.placeholder?.includes('URL') || i.name?.includes('url'));
      if (!nameInp || !urlInp) return null;
      return {
        nameCoords: nameInp.getBoundingClientRect().toJSON(),
        urlCoords: urlInp.getBoundingClientRect().toJSON(),
      };
    });
    if (!baseFields) throw new Error('Não foi possível localizar os campos de Nome ou URL no modal.');
    const { nameCoords, urlCoords } = baseFields as any;

    // 3b. Digita Nome
    await page.mouse.click(nameCoords.x + nameCoords.width / 2, nameCoords.y + nameCoords.height / 2, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.keyboard.type('Lista Principal', { delay: 80 });
    await new Promise(r => setTimeout(r, 400));

    // 3c. Digita URL
    await page.mouse.click(urlCoords.x + urlCoords.width / 2, urlCoords.y + urlCoords.height / 2, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.keyboard.type(playlistUrl, { delay: 40 });
    await new Promise(r => setTimeout(r, 400));

    // 3d. MARCA O CHECKBOX "Protect this playlist"
    // O IBO Pro usa checkbox customizado (provavelmente <input type="checkbox"> oculto
    // com um label visual). Solucao: procurar pelo TEXTO "Protect this playlist" e
    // clicar no elemento clicavel mais proximo (label ou container).
    console.log('[IBO Pro] Marcando checkbox "Protect this playlist"...');
    const checkboxClicked = await page.evaluate(() => {
      // 1. Procura input type=checkbox real
      const inputs = Array.from(document.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
      const realCheckbox = inputs.find(i => {
        const wrapper = i.closest('label, div, span');
        const txt = (wrapper?.textContent || '').toLowerCase();
        return txt.includes('protect this playlist');
      });
      if (realCheckbox) {
        if (!realCheckbox.checked) {
          realCheckbox.click(); // dispara change/click events
        }
        return { strategy: 'real_checkbox', alreadyChecked: realCheckbox.checked };
      }

      // 2. Procura por label/span/div com texto "Protect this playlist" e clica
      const all = Array.from(document.querySelectorAll('label, span, div, p')) as HTMLElement[];
      const labelEl = all.find(el => {
        const txt = el.textContent?.trim().toLowerCase() || '';
        // Match exato ou começa com (pra evitar pegar texto longo que contem)
        return txt === 'protect this playlist' || txt.startsWith('protect this playlist');
      });
      if (labelEl) {
        labelEl.click();
        return { strategy: 'label_text', alreadyChecked: false };
      }

      return null;
    });

    if (!checkboxClicked) {
      console.warn('[IBO Pro] ⚠️ Checkbox "Protect this playlist" nao encontrado.');
    } else {
      console.log(`[IBO Pro] ✅ Checkbox marcado via ${(checkboxClicked as any).strategy}`);
      await new Promise(r => setTimeout(r, 1200)); // espera UI atualizar (campos PIN podem aparecer/habilitar)
    }

    // 3e. RE-LOCALIZA os campos PIN — agora podem ter aparecido ou virado enabled
    // depois do checkbox. Detecta pelo LABEL associado ("PIN" / "Confirm PIN")
    // ou pela proximidade visual, em vez de placeholder (que pode estar vazio).
    console.log('[IBO Pro] Localizando campos PIN e Confirm PIN...');
    const pinFields = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
      // Filtra apenas inputs VISIVEIS e que não sejam o Name/URL/checkbox
      const visible = inputs.filter(i => {
        const r = i.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        if (i.type === 'checkbox' || i.type === 'hidden') return false;
        // Excluir Name e URL pelos placeholders conhecidos
        const p = (i.placeholder || '').toLowerCase();
        if (p.includes('favorite') || p.includes('name') || p.includes('m3u') || p.includes('url')) return false;
        return true;
      });

      // Os 2 campos restantes são PIN e Confirm PIN (na ordem)
      return visible.slice(0, 2).map(inp => inp.getBoundingClientRect().toJSON());
    });

    if (pinFields.length === 0) {
      console.warn('[IBO Pro] ⚠️ Nenhum campo PIN visivel — checkbox provavelmente nao foi marcado.');
    } else {
      console.log(`[IBO Pro] Preenchendo PIN 654321 em ${pinFields.length} campo(s)...`);
      for (const coords of pinFields) {
        await page.mouse.click(coords.x + coords.width / 2, coords.y + coords.height / 2, { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.keyboard.type('654321', { delay: 80 });
        await new Promise(r => setTimeout(r, 400));
      }
    }

    // Print de "Prova Real" antes de salvar
    const proofPath = `c:\\Users\\hldes\\Desktop\\startpainel\\startpainel\\scratch\\ibopro_filled_proof_${Date.now()}.png`;
    await page.screenshot({ path: proofPath });
    console.log(`[IBO Pro] Prova de preenchimento salva: ${proofPath}`);

    await new Promise(r => setTimeout(r, 2000));

    // 4. SUBMIT
    console.log('[IBO Pro] Clicando em SUBMIT...');
    const submitBtnHandle = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      return btns.find(b => b.textContent?.toUpperCase().includes('SUBMIT') || b.textContent?.toUpperCase().includes('SAVE'));
    });

    if (submitBtnHandle && submitBtnHandle.asElement()) {
      const sBox = await (submitBtnHandle.asElement() as any).boundingBox();
      if (sBox) {
        await page.mouse.move(sBox.x + sBox.width / 2, sBox.y + sBox.height / 2);
        await page.mouse.click(sBox.x + sBox.width / 2, sBox.y + sBox.height / 2);
      }
    } else {
      await clickButtonByText(page, ['SUBMIT', 'Save', 'Salvar', 'OK']);
    }

    await new Promise(r => setTimeout(r, 5000));

    // Print de confirmação
    const finalPath = `c:\\Users\\hldes\\Desktop\\startpainel\\startpainel\\scratch\\ibopro_final_${Date.now()}.png`;
    await page.screenshot({ path: finalPath });
    console.log(`[IBO Pro] Screenshot final salvo: ${finalPath}`);

    console.log('[IBO Pro] ✅ Automação concluída com sucesso!');
    return { success: true, message: 'IBO Pro atualizado com sucesso!' };

  } catch (error: any) {
    console.error(`[IBO Pro] ERRO: ${error.message}`);
    return { success: false, message: error.message };
  } finally {
    if (browser) await (browser as any).close();
  }
}
