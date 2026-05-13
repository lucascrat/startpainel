import 'dotenv/config';
import dotenv from 'dotenv';
import { Browser, Page } from 'puppeteer-core';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import os from 'os';
import path from 'path';

// Força o carregamento do .env do diretório atual
dotenv.config({ path: path.join(process.cwd(), '.env') });

// Configura o plugin stealth
puppeteer.use(StealthPlugin());

// Detect OS and set default Chrome path
const isWindows = os.platform() === 'win32';
const DEFAULT_CHROME_PATH = isWindows 
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : '/usr/bin/chromium';

const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || DEFAULT_CHROME_PATH;
const BASE_URL = (process.env.STARTPAINEL_URL || 'https://cms.startpainel.cc').replace(/\/$/, '');
const ADMIN_USER = (process.env.STARTPAINEL_ADMIN_USER || '').trim();
const ADMIN_PASS = (process.env.STARTPAINEL_ADMIN_PASS || '').trim();

console.log(`[Config] Carregando credenciais para: ${ADMIN_USER ? 'OK (' + ADMIN_USER + ')' : 'VAZIO'}`);

export interface RenewalResult {
  success: boolean;
  message: string;
  clientId?: string;
  screenshotBase64?: string;
  playlistUrl?: string;
}

async function launchBrowser(headless = true): Promise<Browser> {
  console.log(`[Puppeteer Stealth] Launching with: ${CHROME_PATH}`);
  
  const userDataDir = path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'PuppeteerProfile');
  
  return puppeteer.launch({
    executablePath: CHROME_PATH,
    headless,
    userDataDir, // Usa um perfil dedicado para o robô não interferir no seu uso diário
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,900',
      '--disable-infobars',
    ],
    defaultViewport: { width: 1280, height: 900 },
  }) as unknown as Browser;
}

async function loginToPanel(page: Page): Promise<boolean> {
  const loginUrl = `${BASE_URL}/login`;
  console.log(`[Puppeteer] Acessando painel...`);
  
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  });

  try {
    // Tenta ir para a home primeiro para ver se já estamos logados
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Verifica se já estamos logados (se não estivermos no /login)
    let currentUrl = page.url();
    if (!currentUrl.includes('/login')) {
      console.log('[Puppeteer] Sessão ativa encontrada! Pulando login.');
      return true;
    }

    console.log('[Puppeteer] Sessão não encontrada, realizando login...');
    await page.goto(loginUrl, { waitUntil: 'networkidle2' });

    const userSelector = 'input#username';
    const passSelector = 'input#password';
    const loginBtnSelector = 'button#loginbtn, button[type="submit"]';

    await page.waitForSelector(userSelector, { timeout: 10000 });
    await page.type(userSelector, ADMIN_USER, { delay: 100 });
    await page.type(passSelector, ADMIN_PASS, { delay: 100 });

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
      page.click(loginBtnSelector)
    ]);

    currentUrl = page.url();
    return !currentUrl.includes('/login');
  } catch (e) {
    console.error('[Puppeteer] Erro no processo de login:', e);
    return false;
  }
}

export async function renewClientPuppeteer(username: string): Promise<RenewalResult> {
  if (!ADMIN_USER || !ADMIN_PASS) {
    return { success: false, message: 'Credenciais não configuradas' };
  }

  let browser: Browser | null = null;
  try {
    console.log(`\n[Puppeteer] === Iniciando renovação para: ${username} ===`);
    // Rodar com headless: false no notebook é MUITO mais seguro contra captcha
    browser = await launchBrowser(false); 
    const page = await browser.newPage();
    
    const loggedIn = await loginToPanel(page);
    if (!loggedIn) {
      return { success: false, message: 'Não foi possível acessar o painel (Login/Captcha).' };
    }

    return await performRenewalFlow(page, username);

  } catch (error: any) {
    return { success: false, message: error.message };
  } finally {
    if (browser) await browser.close();
  }
}

async function performRenewalFlow(page: Page, clientUsername: string): Promise<RenewalResult> {
  try {
    // 1. Ir para a página de clientes
    console.log(`[Puppeteer] Indo para Meus Clientes...`);
    await page.goto(`${BASE_URL}/clients`, { waitUntil: 'networkidle2' });

    // 2. Pesquisar o cliente
    console.log(`[Puppeteer] Pesquisando: ${clientUsername}`);
    const searchSelector = 'input[type="search"]';
    await page.waitForSelector(searchSelector, { timeout: 15000 });
    await page.click(searchSelector, { clickCount: 3 });
    await page.type(searchSelector, clientUsername, { delay: 150 });
    
    // Aguarda carregar o resultado
    await new Promise(r => setTimeout(r, 2000));

    // 3. Localizar e clicar no botão Extender (ícone de calendário verde)
    console.log('[Puppeteer] Clicando no botão Extender (Calendário)...');
    const extendBtnSelector = 'a[data-original-title="Extender"], a[title="Extender"], a[href*="/extend"]';
    
    const extendBtn = await page.$(extendBtnSelector);
    if (!extendBtn) {
      console.error('[Puppeteer] Botão Extender não encontrado para este usuário.');
      return { 
        success: false, 
        message: 'Cliente não encontrado ou botão Extender não disponível.',
        screenshotBase64: await page.screenshot({ encoding: 'base64' }) as string
      };
    }

    await extendBtn.click();
    await new Promise(r => setTimeout(r, 2000));

    // 4. Confirmar no Modal (Botão verde Extender)
    console.log('[Puppeteer] Confirmando no modal...');
    const modalConfirmBtnSelector = '.modal-dialog button.btn-success, .modal-content button.btn-success';
    
    try {
      await page.waitForSelector(modalConfirmBtnSelector, { timeout: 10000 });
      await page.click(modalConfirmBtnSelector);
      
      console.log('[Puppeteer] Aguardando processamento final...');
      await new Promise(r => setTimeout(r, 5000));
      
      return {
        success: true,
        message: `✅ Cliente "${clientUsername}" renovado com sucesso!`,
        screenshotBase64: await page.screenshot({ encoding: 'base64' }) as string
      };
    } catch (e) {
      console.error('[Puppeteer] Botão de confirmação no modal não apareceu.');
      return { 
        success: false, 
        message: 'Modal de confirmação não respondeu.',
        screenshotBase64: await page.screenshot({ encoding: 'base64' }) as string
      };
    }

  } catch (error: any) {
    console.error('[Puppeteer] Erro no fluxo de renovação:', error.message);
    return { 
      success: false, 
      message: `Erro: ${error.message}`,
      screenshotBase64: await page.screenshot({ encoding: 'base64' }) as string
    };
  }
}


export async function renewClientPuppeteerVisible(username: string): Promise<RenewalResult> {
  let browser: Browser | null = null;
  try {
    browser = await launchBrowser(false);
    const page = await browser.newPage();
    const loggedIn = await loginToPanel(page);
    if (!loggedIn) return { success: false, message: 'Login falhou' };
    return await performRenewalFlow(page, username);
  } catch (error: any) {
    return { success: false, message: error.message };
  } finally {
    if (browser) await browser.close();
  }
}

export async function createClientAndGetPlaylist(username: string): Promise<RenewalResult> {
  let browser: Browser | null = null;
  try {
    console.log(`\n[Puppeteer] === Iniciando criação de cliente: ${username} ===`);
    browser = await launchBrowser(false); // Visible to handle any unexpected popups or captchas
    const page = await browser.newPage();
    
    const loggedIn = await loginToPanel(page);
    if (!loggedIn) {
      return { success: false, message: 'Não foi possível acessar o painel (Login/Captcha).' };
    }

    // 1. Navigate to New Client
    console.log(`[Puppeteer] Indo para Novo Cliente...`);
    await page.goto(`${BASE_URL}/clients/new`, { waitUntil: 'networkidle2' });

    // 2. Step 1: Login Info
    console.log(`[Puppeteer] Preenchendo nome de usuário...`);
    await page.waitForSelector('input[name="username"], input[type="text"]', { timeout: 10000 });
    
    // Find the right input (usually the first text input that isn't search)
    const inputs = await page.$$('input[type="text"]');
    if (inputs.length > 0) {
      // Clear and type
      await inputs[0].click({ clickCount: 3 });
      await inputs[0].type(username, { delay: 100 });
    }

    // Click "Proximo"
    console.log(`[Puppeteer] Clicando em Próximo (Passo 1)...`);
    const nextBtns = await page.$$('button');
    for (const btn of nextBtns) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text?.toLowerCase().includes('proximo') || text?.toLowerCase().includes('próximo')) {
        await btn.click();
        break;
      }
    }

    await new Promise(r => setTimeout(r, 2000));

    // 3. Step 2: Plans
    console.log(`[Puppeteer] Selecionando o plano...`);
    // Assuming it's a select2 or similar dropdown
    // Try to find the dropdown container and click it
    const dropdowns = await page.$$('.select2-selection, select');
    if (dropdowns.length > 0) {
      await dropdowns[0].click();
      await new Promise(r => setTimeout(r, 1000));
      // Type the plan name in the search box if it appears
      const searchInputs = await page.$$('.select2-search__field, input[type="search"]');
      if (searchInputs.length > 0) {
        // Find the visible one
        for (const input of searchInputs) {
          const isVisible = await input.evaluate(el => {
            const style = window.getComputedStyle(el);
            return style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
          });
          if (isVisible) {
            await input.type('COMPLETO - 1 MÊS - 1 CRÉDITO', { delay: 50 });
            await page.keyboard.press('Enter');
            break;
          }
        }
      } else {
        // Fallback: if it's a native select
        await page.evaluate(() => {
          const select = document.querySelector('select');
          if (select) {
            for (let i = 0; i < select.options.length; i++) {
              if (select.options[i].text.includes('COMPLETO - 1 MÊS - 1 CRÉDITO')) {
                select.selectedIndex = i;
                select.dispatchEvent(new Event('change'));
                break;
              }
            }
          }
        });
      }
    }

    // Click "Proximo" again
    console.log(`[Puppeteer] Clicando em Próximo (Passo 2)...`);
    const nextBtns2 = await page.$$('button');
    for (const btn of nextBtns2) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text?.toLowerCase().includes('proximo') || text?.toLowerCase().includes('próximo')) {
        await btn.click();
        break;
      }
    }

    await new Promise(r => setTimeout(r, 2000));

    // 4. Step 3: Confirm and Create
    console.log(`[Puppeteer] Clicando em Criar Cliente...`);
    const createBtns = await page.$$('button');
    for (const btn of createBtns) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text?.toLowerCase().includes('criar') || text?.toLowerCase().includes('confirmar') || text?.toLowerCase().includes('finalizar')) {
        await btn.click();
        break;
      }
    }

    // Wait for redirect or success message
    console.log(`[Puppeteer] Aguardando criação...`);
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000)); // Extra wait just in case

    // 5. Navigate to Clients List to find the new client and view details
    console.log(`[Puppeteer] Indo para a lista de clientes para extrair a M3U...`);
    await page.goto(`${BASE_URL}/clients`, { waitUntil: 'networkidle2' });

    // Search the client
    const searchSelector = 'input[type="search"]';
    await page.waitForSelector(searchSelector, { timeout: 15000 });
    await page.click(searchSelector, { clickCount: 3 });
    await page.type(searchSelector, username, { delay: 150 });
    await new Promise(r => setTimeout(r, 2000));

    // Click "Visualizar"
    console.log('[Puppeteer] Clicando em Visualizar...');
    const viewBtnSelector = 'a[data-original-title="Visualizar"], a[title="Visualizar"], a[href*="/view"], .fa-eye';
    const viewBtn = await page.$(viewBtnSelector);
    if (!viewBtn) {
       throw new Error('Botão Visualizar não encontrado após criação.');
    }
    
    // If it's an icon inside a link, we click the parent or the element itself
    await page.evaluate((selector) => {
      const el = document.querySelector(selector) as HTMLElement;
      if (el) el.click();
    }, viewBtnSelector);

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));

    // 6. Extract M3U URL
    console.log('[Puppeteer] Procurando a URL M3U na página...');
    // M3U URLs typically contain "get.php" and "username=" and end with type=m3u or similar, or just are in an input box
    const m3uUrl = await page.evaluate(() => {
      // Look at all inputs and textareas
      const elements = Array.from(document.querySelectorAll('input, textarea')) as HTMLInputElement[];
      for (const el of elements) {
        if (el.value && el.value.includes('get.php') && (el.value.includes('m3u') || el.value.includes('type=m3u_plus'))) {
          return el.value;
        }
      }
      
      // Look at all text nodes and links
      const links = Array.from(document.querySelectorAll('a')) as HTMLAnchorElement[];
      for (const link of links) {
        if (link.href && link.href.includes('get.php') && link.href.includes('m3u')) {
          return link.href;
        }
      }

      // Brute force text search in body
      const bodyText = document.body.innerText;
      const match = bodyText.match(/https?:\/\/[^\s"']+(?:get\.php)[^\s"']+/);
      return match ? match[0] : null;
    });

    if (!m3uUrl) {
      throw new Error('Lista M3U não encontrada na página de visualização.');
    }

    console.log(`[Puppeteer] M3U encontrada: ${m3uUrl}`);

    return {
      success: true,
      message: `Cliente ${username} criado com sucesso!`,
      playlistUrl: m3uUrl
    };

  } catch (error: any) {
    console.error('[Puppeteer] Erro na criação de cliente:', error.message);
    return { 
      success: false, 
      message: `Erro: ${error.message}`
    };
  } finally {
    if (browser) {
      // Commented out to keep browser open for debugging if needed, but normally should close
      // await browser.close();
    }
  }
}

/**
 * Ativa um player no painel CMS pra um cliente:
 *   1. Login no cms.startpainel.cc
 *   2. Clientes -> pesquisa username -> Visualizar
 *   3. Botao "Ativar Player"
 *   4. No modal: dropdown seleciona `playerName` (matching por texto, case-insensitive)
 *   5. Input do MAC
 *   6. Confirma com botao "Ativar Player" / "Salvar" / "Confirmar"
 *
 * Wrappers (compatibilidade com codigo existente):
 *   - activateUltraPlayer(u,m) -> activatePlayer(u,m,'Ultra Player')
 *   - activateFunPlay(u,m)     -> activatePlayer(u,m,'Fun Play')
 */
export async function activatePlayer(username: string, mac: string, playerName: string): Promise<RenewalResult> {
  let browser: Browser | null = null;
  try {
    console.log(`\n[Puppeteer] === Ativando "${playerName}" para: ${username} (MAC: ${mac}) ===`);
    browser = await launchBrowser(false); // Visible for monitoring
    const page = await browser.newPage();
    
    const loggedIn = await loginToPanel(page);
    if (!loggedIn) {
      return { success: false, message: 'Não foi possível acessar o painel (Login/Captcha).' };
    }

    // 1. Go to clients list
    console.log(`[Puppeteer] Indo para a lista de clientes...`);
    await page.goto(`${BASE_URL}/clients`, { waitUntil: 'networkidle2' });

    // 2. Search the client
    console.log(`[Puppeteer] Pesquisando: ${username}`);
    const searchSelector = 'input[type="search"]';
    await page.waitForSelector(searchSelector, { timeout: 15000 });
    await page.click(searchSelector, { clickCount: 3 });
    await page.type(searchSelector, username, { delay: 150 });
    await new Promise(r => setTimeout(r, 2000));

    // 2.5 Verifica se a pesquisa retornou resultado antes de procurar o botao.
    // DataTables.net renderiza td.dataTables_empty quando nao tem match — usa isso
    // como sinal primario. Fallback: contar tbody rows com dado real.
    const searchResult = await page.evaluate(() => {
      const emptyCell = document.querySelector('td.dataTables_empty, .dataTables_empty');
      if (emptyCell) return { found: false, hint: emptyCell.textContent?.trim() || 'no results cell' };
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      // Algumas tabelas mostram so 1 linha com 'No matching records found' / 'Nenhum'
      const dataRows = rows.filter(tr => {
        const txt = tr.textContent?.toLowerCase() || '';
        if (txt.includes('no data') || txt.includes('no matching') ||
            txt.includes('nenhum registro') || txt.includes('nenhum resultado') ||
            txt.includes('sem registros')) return false;
        // Linha valida tem >=2 colunas com conteudo
        const cells = tr.querySelectorAll('td');
        return cells.length >= 2;
      });
      return { found: dataRows.length > 0, hint: `${dataRows.length} linha(s) na tabela` };
    });

    if (!searchResult.found) {
      console.log(`[Puppeteer] Cliente "${username}" nao encontrado (${searchResult.hint}).`);
      return {
        success: false,
        message: `Cliente "${username}" nao foi encontrado no painel CMS. Confira se o username esta correto.`,
      };
    }

    // 3. Click "Visualizar" / "Detalhes"
    console.log('[Puppeteer] Clicando em Detalhes/Visualizar...');
    const viewBtnSelector = 'a[data-original-title="Visualizar"], a[title="Visualizar"], a[href*="/view"], .fa-eye';
    const viewBtn = await page.$(viewBtnSelector);
    if (!viewBtn) {
       throw new Error('Botao Detalhes/Visualizar nao encontrado (cliente foi encontrado mas selector do botao nao bate). Pode ser que o CMS atualizou — me avisa.');
    }
    
    await page.evaluate((selector) => {
      const el = document.querySelector(selector) as HTMLElement;
      if (el) el.click();
    }, viewBtnSelector);

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));

    // 4. Click "Ativar Player"
    console.log('[Puppeteer] Clicando em Ativar Player...');
    const activateBtnSelector = 'button, a';
    const buttons = await page.$$(activateBtnSelector);
    let foundActivateBtn = false;
    for (const btn of buttons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text?.toLowerCase().includes('ativar player')) {
        await btn.click();
        foundActivateBtn = true;
        break;
      }
    }

    if (!foundActivateBtn) {
      throw new Error('Botão "Ativar Player" não encontrado na página de detalhes.');
    }

    await new Promise(r => setTimeout(r, 2000)); // wait for modal

    // 5. Select player no dropdown
    console.log(`[Puppeteer] Selecionando "${playerName}" no dropdown e preenchendo MAC...`);

    // Select dropdown — match por substring case-insensitive do texto da option
    const selectSelectors = ['select[name="player"]', 'select[name="app"]', 'select'];
    let selected = false;
    const playerNameLower = playerName.toLowerCase();
    for (const sel of selectSelectors) {
      try {
        const selectEl = await page.$(sel);
        if (selectEl) {
          const ok = await page.evaluate((selector, needle) => {
            const select = document.querySelector(selector) as HTMLSelectElement;
            if (!select) return false;
            for (let i = 0; i < select.options.length; i++) {
              if (select.options[i].text.toLowerCase().includes(needle)) {
                select.selectedIndex = i;
                select.dispatchEvent(new Event('change'));
                return true;
              }
            }
            return false;
          }, sel, playerNameLower);
          if (ok) { selected = true; break; }
        }
      } catch(e) {}
    }
    if (!selected) {
      throw new Error(`Player "${playerName}" nao encontrado no dropdown. Confira o nome no painel.`);
    }

    // Input MAC
    const macSelectors = ['input[name="mac"]', 'input[name="mac_address"]', 'input[placeholder*="MAC"]', 'input[placeholder*="00:1A:2B"]'];
    for (const mSel of macSelectors) {
      try {
        const macInput = await page.$(mSel);
        if (macInput) {
          // Check visibility
          const isVisible = await page.evaluate(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
          }, macInput);
          if (isVisible) {
            await page.type(mSel, mac, { delay: 100 });
            break;
          }
        }
      } catch(e) {}
    }

    // Click "Ativar Player" submit
    console.log('[Puppeteer] Confirmando ativação no modal...');
    const modalButtons = await page.$$('.modal button');
    for (const btn of modalButtons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text?.toLowerCase().includes('ativar player') || text?.toLowerCase().includes('salvar') || text?.toLowerCase().includes('confirmar')) {
        await btn.click();
        break;
      }
    }

    console.log('[Puppeteer] Aguardando processamento...');
    await new Promise(r => setTimeout(r, 5000));

    return {
      success: true,
      message: `${playerName} ativado com sucesso para ${username} (MAC: ${mac})!`
    };

  } catch (error: any) {
    console.error(`[Puppeteer] Erro na ativacao do ${playerName}:`, error.message);
    return {
      success: false,
      message: `Erro: ${error.message}`
    };
  } finally {
    if (browser) {
      // await browser.close();
    }
  }
}

// Wrappers de compatibilidade (cada player tem seu nome no dropdown do CMS).
// Se o painel mudar o nome exato no futuro, basta editar a string aqui.
export async function activateUltraPlayer(username: string, mac: string): Promise<RenewalResult> {
  return activatePlayer(username, mac, 'Ultra Player');
}

export async function activateFunPlay(username: string, mac: string): Promise<RenewalResult> {
  return activatePlayer(username, mac, 'Fun Play');
}
