import { launchBrowser } from './startpainel-puppeteer.js';

const ATIVEAPP_LOGIN_URL  = 'https://www.ativeapp.com/auth';
const ATIVEAPP_ACTIV_URL  = 'https://www.ativeapp.com/reseller/activations';
// Trechos de URL que indicam que NÃO estamos logados (caímos na tela de login)
const LOGIN_URL_MARKERS   = ['/auth', '/login'];

function isOnLoginPage(url: string): boolean {
  return LOGIN_URL_MARKERS.some(m => url.includes(m));
}
const ATIVEAPP_EMAIL      = process.env.ATIVEAPP_EMAIL    || '';
const ATIVEAPP_PASSWORD   = process.env.ATIVEAPP_PASSWORD || '';

// Perfil dedicado para o AtiveApp (não compartilhado com os 5 perfis paralelos).
// A sessão de login (cookies) persiste neste perfil entre execuções, então o
// primeiro login com verificação por telefone só precisa ser feito UMA vez.
const ATIVEAPP_PROFILE_NUM = 98;

// Mapa de nomes amigáveis → termos para pesquisa no dropdown do AtiveApp
const APP_SEARCH_MAP: Record<string, string> = {
  'ibo pro':       'IBO PRO',
  'ibo player':    'IBO PLAYER',
  'bob player':    'BOB PLAYER',
  'vu player':     'VU PLAYER',
  'big player':    'BIG PLAYER',
  'box player':    'BOX PLAYER',
  'core player':   'CORE PLAYER',
  'fenix player':  'FENIX PLAYER',
  'magic player':  'MAGIC PLAYER',
  'quick player':  'QUICK PLAYER',
  'assist plus':   'ASSIST PLUS',
  'fun play':      'FUN PLAY',
};

function normalizeAppName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

export function resolveAtiveAppSearch(appName: string): string {
  const key = normalizeAppName(appName);
  for (const [k, v] of Object.entries(APP_SEARCH_MAP)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return appName.toUpperCase();
}

/**
 * Preenche e-mail/senha, marca "Lembrar de mim" e clica em Entrar na tela /auth.
 * Não trata verificação por telefone — se ela aparecer, o login não conclui sozinho.
 */
async function fillAndSubmitLogin(page: any): Promise<void> {
  await page.waitForSelector('input[type="email"], input[name="email"]', { visible: true, timeout: 10_000 });

  // Seleciona tudo com Ctrl+A e digita o novo valor (substitui qualquer texto existente/autocomplete)
  await page.click('input[type="email"], input[name="email"]');
  await page.keyboard.down('Control');
  await page.keyboard.press('a');
  await page.keyboard.up('Control');
  await page.type('input[type="email"], input[name="email"]', ATIVEAPP_EMAIL, { delay: 50 });

  await page.click('input[type="password"]');
  await page.keyboard.down('Control');
  await page.keyboard.press('a');
  await page.keyboard.up('Control');
  await page.type('input[type="password"]', ATIVEAPP_PASSWORD, { delay: 50 });

  // Marca "Lembrar de mim" (evita re-disparar verificação por telefone)
  await page.evaluate(() => {
    const cb = document.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    if (cb && !cb.checked) cb.click();
  });
  await new Promise(r => setTimeout(r, 300));

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => (b.textContent || '').trim().toLowerCase().includes('entrar'));
    (btn as HTMLElement)?.click();
  });
}

/**
 * Espera até a URL sair da tela de login (até `timeoutMs`). Retorna true se logou.
 */
async function waitUntilLoggedIn(page: any, timeoutMs = 20_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
    if (!isOnLoginPage(page.url())) return true;
  }
  return !isOnLoginPage(page.url());
}

/**
 * Abre o browser VISÍVEL no perfil dedicado, preenche as credenciais e espera o
 * operador concluir o login manualmente (incluindo a verificação por telefone que
 * o AtiveApp pede no primeiro acesso). Após logar uma vez, a sessão persiste no
 * perfil e as ativações automáticas não pedem mais verificação.
 *
 * Rode isto UMA VEZ ao configurar (ex: via script iniciar-ativeapp.bat).
 */
export async function initAtiveAppSession(): Promise<{ success: boolean; message: string }> {
  if (!ATIVEAPP_EMAIL || !ATIVEAPP_PASSWORD) {
    return { success: false, message: 'Credenciais do AtiveApp não configuradas (ATIVEAPP_EMAIL / ATIVEAPP_PASSWORD).' };
  }

  let browser: any = null;
  try {
    console.log('[AtiveApp Init] Abrindo browser para login manual...');
    browser = await launchBrowser(false, ATIVEAPP_PROFILE_NUM) as any;
    if (!browser) throw new Error('Falha ao iniciar o navegador.');

    const page = await (browser as any).newPage();
    await page.setViewport({ width: 1366, height: 768 });

    await page.goto(ATIVEAPP_LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30_000 });
    await new Promise(r => setTimeout(r, 2000));

    // Já logado? Sessão válida.
    if (!isOnLoginPage(page.url())) {
      console.log('[AtiveApp Init] Já autenticado! URL:', page.url());
      return { success: true, message: 'AtiveApp já está autenticado! Sessão válida.' };
    }

    // Preenche credenciais, marca "Lembrar de mim" e clica em Entrar
    try {
      await page.waitForSelector('input[type="email"], input[name="email"]', { visible: true, timeout: 10_000 });

      // Seleciona tudo com Ctrl+A e digita (substitui qualquer valor existente/autocomplete)
      await page.click('input[type="email"], input[name="email"]');
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await page.type('input[type="email"], input[name="email"]', ATIVEAPP_EMAIL, { delay: 60 });

      await page.click('input[type="password"]');
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await page.type('input[type="password"]', ATIVEAPP_PASSWORD, { delay: 60 });
      console.log('[AtiveApp Init] Credenciais preenchidas.');

      // Marca "Lembrar de mim" se ainda não estiver marcado (essencial pra sessão persistir)
      await page.evaluate(() => {
        const cb = document.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
        if (cb && !cb.checked) cb.click();
      });
      await new Promise(r => setTimeout(r, 400));

      // Clica no botão "Entrar"
      const clicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => (b.textContent || '').trim().toLowerCase().includes('entrar'));
        if (btn) { (btn as HTMLElement).click(); return true; }
        return false;
      });
      console.log(`[AtiveApp Init] Botão Entrar clicado: ${clicked}`);
    } catch (e: any) {
      console.log('[AtiveApp Init] Não preencheu/clicou automaticamente:', e?.message);
    }

    console.log('[AtiveApp Init] *** Se aparecer verificação por telefone, conclua no browser aberto. ***');
    console.log('[AtiveApp Init] Aguardando login por até 5 minutos...');

    const deadline = Date.now() + 300_000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 2500));
      if (!isOnLoginPage(page.url())) {
        console.log('[AtiveApp Init] Login detectado! URL:', page.url());
        // dá um tempo pra cookies persistirem em disco
        await new Promise(r => setTimeout(r, 3000));
        await (browser as any).close();
        browser = null;
        return { success: true, message: 'Sessão AtiveApp autenticada com sucesso! Ativações prontas.' };
      }
    }
    return { success: false, message: 'Timeout: aguardou 5 minutos mas o login não foi concluído.' };
  } catch (err: any) {
    console.error('[AtiveApp Init] Erro:', err?.message);
    return { success: false, message: err?.message || 'Erro ao iniciar sessão AtiveApp.' };
  } finally {
    if (browser) { try { await (browser as any).close(); } catch {} }
  }
}

export async function runAtiveAppActivation(
  appName: string,
  mac: string,
  _profileNum: number
): Promise<{ success: boolean; message: string }> {
  if (!ATIVEAPP_EMAIL || !ATIVEAPP_PASSWORD) {
    return { success: false, message: 'Credenciais do AtiveApp não configuradas (ATIVEAPP_EMAIL / ATIVEAPP_PASSWORD).' };
  }

  let browser: any = null;
  try {
    // Usa SEMPRE o perfil dedicado — onde a sessão de login persiste.
    browser = await launchBrowser(false, ATIVEAPP_PROFILE_NUM);
    if (!browser) throw new Error('Falha ao iniciar o navegador.');

    const page = await (browser as any).newPage();
    await page.setViewport({ width: 1366, height: 768 });

    // ── Acessa a página de Ativações; loga sozinho se necessário ────────────
    // O token do AtiveApp não persiste entre fechamentos do Chrome, então a
    // automação faz login a cada execução. Como o aparelho já está "lembrado"
    // (primeiro login manual), o re-login normalmente não pede verificação.
    console.log(`[AtiveApp] Acessando ativações...`);
    await page.goto(ATIVEAPP_ACTIV_URL, { waitUntil: 'networkidle2', timeout: 30_000 });
    await new Promise(r => setTimeout(r, 4000));

    if (isOnLoginPage(page.url())) {
      console.log('[AtiveApp] Caiu no login — tentando autenticar automaticamente...');
      try {
        await fillAndSubmitLogin(page);
      } catch (e: any) {
        console.log('[AtiveApp] Falha ao preencher login:', e?.message);
      }
      const logged = await waitUntilLoggedIn(page, 25_000);
      if (!logged) {
        throw new Error('Não consegui logar no AtiveApp automaticamente (provável verificação por telefone). Rode iniciar-autenticacao-ativeapp.bat para reautenticar.');
      }
      // Garante que estamos na página de ativações
      if (!page.url().includes('/activations')) {
        await page.goto(ATIVEAPP_ACTIV_URL, { waitUntil: 'networkidle2', timeout: 30_000 });
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    console.log('[AtiveApp] Sessão ativa, URL:', page.url());

    // ── Abre modal "Nova Ativação" ────────────────────────────────────────
    console.log('[AtiveApp] Abrindo modal de nova ativação...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      const btn = btns.find(b => {
        const t = (b.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim();
        return t.includes('nova ativa') || t.includes('ativar um app');
      });
      (btn as HTMLElement)?.click();
    });
    await new Promise(r => setTimeout(r, 2500));

    // Screenshot para confirmar modal aberto
    await page.screenshot({ path: `D:/startpainel/startpainel/debug-ativeapp-1-modal.png` }).catch(() => {});
    console.log('[AtiveApp] Screenshot 1: modal aberto → debug-ativeapp-1-modal.png');

    // ── Selecionar Aplicativo (Radix Select) ─────────────────────────────
    const searchTerm = resolveAtiveAppSearch(appName);
    console.log(`[AtiveApp] Clicando no combobox para selecionar: "${searchTerm}"`);

    // Clica no botão combobox pelo texto visível
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => (b.textContent || '').trim().toLowerCase().includes('selecione um aplicativo'));
      (btn as HTMLElement)?.click();
    });
    await new Promise(r => setTimeout(r, 1500)); // aguarda portal Radix renderizar

    // Screenshot das opções abertas
    await page.screenshot({ path: `D:/startpainel/startpainel/debug-ativeapp-2-dropdown.png` }).catch(() => {});
    console.log('[AtiveApp] Screenshot 2: dropdown aberto → debug-ativeapp-2-dropdown.png');

    // Lista todas as opções visíveis no portal (Radix renderiza no <body>)
    const optionsFound = await page.evaluate((term: string) => {
      const allOpts = Array.from(document.querySelectorAll('[role="option"]'));
      const names = allOpts.map(o => (o.textContent || '').trim());
      const match = allOpts.find(o => (o.textContent || '').toUpperCase().includes(term));
      if (match) {
        (match as HTMLElement).click();
        return { clicked: true, term, allOptions: names };
      }
      return { clicked: false, term, allOptions: names };
    }, searchTerm);

    console.log(`[AtiveApp] Opções encontradas: ${JSON.stringify(optionsFound.allOptions)}`);
    console.log(`[AtiveApp] Clicou na opção: ${optionsFound.clicked}`);

    if (!optionsFound.clicked) {
      throw new Error(`Opção "${searchTerm}" não encontrada. Disponíveis: ${optionsFound.allOptions.join(', ')}`);
    }
    await new Promise(r => setTimeout(r, 1500));

    // Screenshot após selecionar app
    await page.screenshot({ path: `D:/startpainel/startpainel/debug-ativeapp-3-app-selected.png` }).catch(() => {});
    console.log('[AtiveApp] Screenshot 3: app selecionado → debug-ativeapp-3-app-selected.png');

    // ── MAC do Dispositivo ─────────────────────────────────────────────────
    console.log(`[AtiveApp] Preenchendo MAC: ${mac}`);

    // Espera o input do MAC aparecer após a seleção do app (DOM re-renderiza)
    const macSelector = 'input[placeholder*="00:11"], input[placeholder*="XX:XX"]';
    await page.waitForSelector(macSelector, { visible: true, timeout: 8_000 });
    await new Promise(r => setTimeout(r, 500));

    // page.click() + page.type() usam seletor (busca elemento fresco a cada chamada)
    await page.click(macSelector, { clickCount: 1 });
    await new Promise(r => setTimeout(r, 400));

    // Confirma foco
    const focusedInfo = await page.evaluate(() => {
      const a = document.activeElement as HTMLInputElement | null;
      return { tag: a?.tagName, placeholder: a?.placeholder || '', name: a?.name || '' };
    });
    console.log(`[AtiveApp] Elemento focado:`, focusedInfo);

    // Digita o MAC (vai pro elemento focado)
    await page.keyboard.type(mac, { delay: 100 });
    await new Promise(r => setTimeout(r, 1000));

    // Verificação
    const macFilledValue = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const macInput = inputs.find(i =>
        (i.placeholder || '').includes('00:11') ||
        (i.placeholder || '').includes('XX:XX')
      );
      return macInput?.value || '';
    });
    console.log(`[AtiveApp] Valor lido do campo MAC: "${macFilledValue}"`);

    if (!macFilledValue || macFilledValue.replace(/[^0-9a-f]/gi, '').length < 8) {
      throw new Error(`MAC não foi preenchido corretamente. Valor lido: "${macFilledValue}"`);
    }

    // Screenshot antes de confirmar
    await page.screenshot({ path: `D:/startpainel/startpainel/debug-ativeapp-4-mac.png` }).catch(() => {});
    console.log('[AtiveApp] Screenshot 4: MAC preenchido → debug-ativeapp-4-mac.png');

    // ── Concluir Ativação ──────────────────────────────────────────────────
    console.log('[AtiveApp] Clicando em "Concluir Ativação"...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => (b.textContent || '').toLowerCase().includes('concluir'));
      (btn as HTMLElement)?.click();
    });
    await new Promise(r => setTimeout(r, 5000));

    // Screenshot do resultado final
    await page.screenshot({ path: `D:/startpainel/startpainel/debug-ativeapp-5-result.png` }).catch(() => {});
    console.log('[AtiveApp] Screenshot 5: resultado → debug-ativeapp-5-result.png');

    const pageText = await page.evaluate(() => document.body.innerText);
    const succeeded = pageText.toLowerCase().includes('sucesso') ||
                      pageText.toLowerCase().includes('ativado');
    const noError = !pageText.toLowerCase().includes('inválido') &&
                    !pageText.toLowerCase().includes('erro') &&
                    !pageText.toLowerCase().includes('crédito');

    if (!succeeded && !noError) {
      throw new Error('Ativação não confirmada — verifique o screenshot debug-ativeapp-5-result.png');
    }

    console.log(`[AtiveApp] ✅ App "${appName}" ativado para MAC ${mac}`);
    return { success: true, message: `App ${appName} ativado com sucesso para MAC ${mac}.` };

  } catch (err: any) {
    console.error('[AtiveApp] Erro:', err?.message);
    return { success: false, message: err?.message || 'Erro ao ativar no AtiveApp.' };
  } finally {
    if (browser) {
      try { await (browser as any).close(); } catch {}
    }
  }
}
