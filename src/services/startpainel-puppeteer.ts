import 'dotenv/config';
import dotenv from 'dotenv';
import { Browser, Page } from 'puppeteer-core';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import os from 'os';
import path from 'path';
import { GoogleGenerativeAI } from "@google/generative-ai";

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

export async function launchBrowser(headless = true): Promise<Browser> {
  console.log(`[Puppeteer Stealth] Launching with: ${CHROME_PATH}`);
  
  const userDataDir = process.env.PUPPETEER_USER_DATA_DIR || path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'PuppeteerProfile');
  
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

export async function loginToPanel(page: Page): Promise<boolean> {
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

    const creds = await extractCredentialsFromPage(page);
    console.log(`[Puppeteer] Credenciais extraídas: user=${creds.user}, pass=${creds.pass}`);

    return {
      success: true,
      message: `Cliente ${username} criado com sucesso!`,
      playlistUrl: m3uUrl,
      username: creds.user || username,
      password: creds.pass
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

export async function activateLazerPlay(username: string, mac: string): Promise<RenewalResult> {
  return activatePlayer(username, mac, 'Lazer Play');
}

export async function activateXCloud(username: string, mac: string): Promise<RenewalResult> {
  return activatePlayer(username, mac, 'X-Cloud');
}

export async function activateSeePlay(username: string, mac: string): Promise<RenewalResult> {
  return activatePlayer(username, mac, 'See Play');
}

/**
 * Cria um cliente de TESTE (6 horas) no CMS e ja ativa o player com o MAC.
 * Fluxo no CMS https://cms.startpainel.cc/:
 *   1. /clients/new -> Step 1: nome de usuario -> Proximo
 *   2. Step 2: Plano "COMPLETO - TESTE 6 HORAS" -> Proximo
 *   3. Step 3: Criar Cliente -> redireciona pra pagina do cliente
 *   4. Clica em "Ativar Player" -> modal abre
 *   5. Dropdown: seleciona o player (Ultra Player / Fun Play / etc)
 *   6. Input MAC -> preenche
 *   7. Confirma com "Ativar Player" do modal
 *
 * @param username sugestao de username. Se vazio, gera "Teste<timestamp>".
 * @param mac MAC do aparelho do cliente (XX:XX:XX:XX:XX:XX)
 * @param playerName nome do player no dropdown (ex: "Ultra Player")
 * @returns { success, message, username, playerName, mac }
 */
export async function createTestClientAndActivatePlayer(
  username: string,
  mac: string,
  playerName: string,
): Promise<RenewalResult & { username?: string; playerName?: string; mac?: string }> {
  let browser: Browser | null = null;
  // Username unico — se nao veio um, gera baseado em timestamp pra evitar colisao no CMS
  const finalUsername = (username && username.trim()) || `Teste${Date.now().toString().slice(-7)}`;

  try {
    console.log(`\n[Puppeteer] === Teste 6h: criando ${finalUsername} + ativando ${playerName} (MAC: ${mac}) ===`);
    browser = await launchBrowser(false);
    const page = await browser.newPage();

    if (!await loginToPanel(page)) {
      return { success: false, message: 'Nao foi possivel acessar o painel (Login/Captcha).' };
    }

    // === STEP 1: novo cliente ===
    console.log('[Puppeteer] Indo para /clients/new...');
    await page.goto(`${BASE_URL}/clients/new`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));

    // Tipo IPTV (default — geralmente ja vem selecionado, garantimos)
    console.log('[Puppeteer] Selecionando tipo IPTV...');
    await page.evaluate(() => {
      const radios = Array.from(document.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
      const iptv = radios.find(r => (r.value || '').toLowerCase() === 'iptv' || r.id?.toLowerCase().includes('iptv'));
      if (iptv && !iptv.checked) iptv.click();
    });

    // Preenche nome de usuario (primeiro input de texto visivel)
    console.log(`[Puppeteer] Preenchendo username: ${finalUsername}`);
    await page.waitForSelector('input[type="text"]', { timeout: 10000 });
    await page.evaluate((val) => {
      const inputs = Array.from(document.querySelectorAll('input[type="text"]')) as HTMLInputElement[];
      // pega o primeiro visivel
      const visible = inputs.find(i => i.offsetParent !== null && !i.placeholder?.toLowerCase().includes('search'));
      if (visible) {
        visible.value = '';
        visible.focus();
      }
    }, finalUsername);
    const userInputs = await page.$$('input[type="text"]');
    if (userInputs[0]) {
      await userInputs[0].click({ clickCount: 3 });
      await userInputs[0].type(finalUsername, { delay: 80 });
      await new Promise(r => setTimeout(r, 800)); // Espera o painel validar o input
    }

    // Botao Proximo (passo 1)
    console.log('[Puppeteer] Clicando em Proximo...');
    const step1Ok = await clickButtonByText(page, ['proximo', 'próximo']);
    if (!step1Ok) throw new Error('Botao "Próximo" do passo 1 nao encontrado ou nao clicavel.');
    await new Promise(r => setTimeout(r, 1500));

    // === STEP 2: plano ===
    console.log('[Puppeteer] Selecionando plano "COMPLETO - TESTE 6 HORAS"...');
    // Tenta dropdown nativo primeiro (mais confiavel)
    const planSelected = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
      for (const select of selects) {
        for (let i = 0; i < select.options.length; i++) {
          const txt = select.options[i].text.toUpperCase();
          // Match preferencial: "COMPLETO - TESTE 6 HORAS" (com adulto)
          if (txt.includes('COMPLETO') && txt.includes('TESTE') && txt.includes('6 HORAS') && !txt.includes('SEM ADULTO')) {
            select.selectedIndex = i;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return select.options[i].text;
          }
        }
      }
      // Fallback: qualquer plano de teste 6 horas
      for (const select of selects) {
        for (let i = 0; i < select.options.length; i++) {
          const txt = select.options[i].text.toUpperCase();
          if (txt.includes('TESTE') && txt.includes('6 HORAS')) {
            select.selectedIndex = i;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return select.options[i].text;
          }
        }
      }
      return null;
    });

    if (!planSelected) {
      // Tenta Select2 (dropdown estilizado): clica e digita
      console.log('[Puppeteer] Plano nativo nao funcionou, tentando Select2...');
      const dropdowns = await page.$$('.select2-selection');
      if (dropdowns[0]) {
        await dropdowns[0].click();
        await new Promise(r => setTimeout(r, 800));
        const search = await page.$('.select2-search__field, input.select2-search__field');
        if (search) {
          await search.type('TESTE 6 HORAS', { delay: 50 });
          await new Promise(r => setTimeout(r, 800));
          await page.keyboard.press('Enter');
        }
      }
    } else {
      console.log(`[Puppeteer] Plano selecionado: ${planSelected}`);
    }
    await new Promise(r => setTimeout(r, 1000));

    // Proximo (passo 2)
    await clickButtonByText(page, ['proximo', 'próximo']);
    await new Promise(r => setTimeout(r, 1500));

    // === STEP 3: criar cliente ===
    console.log('[Puppeteer] Confirmando criacao do cliente (Passo Final)...');
    
    // Debug: tira print da tela antes de clicar
    const debugPath = path.join(process.cwd(), 'scratch', `debug_step3_${Date.now()}.png`);
    await page.screenshot({ path: debugPath });
    console.log(`[Puppeteer] Debug screenshot salvo em: ${debugPath}`);

    // Tenta localizar o botao especifico "Criar Cliente" e clicar com o mouse
    const createBtnSelector = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a, input'));
      const target = btns.find(b => {
        const txt = (b.textContent || (b as any).value || '').toLowerCase();
        return txt.includes('criar cliente');
      }) as HTMLElement;
      if (target) {
        target.id = 'target_create_btn';
        return '#target_create_btn';
      }
      return null;
    });

    if (createBtnSelector) {
      console.log('[Puppeteer] Botao encontrado. Clicando 2x para garantir...');
      await page.click(createBtnSelector, { clickCount: 2, delay: 200 });
      await page.keyboard.press('Enter'); // Backup
    } else {
      console.warn('[Puppeteer] Botao "Criar Cliente" nao encontrado pelo seletor alvo. Tentando helper...');
      await clickButtonByText(page, ['criar cliente', 'criar', 'confirmar', 'finalizar']);
    }

    // Aguarda processamento
    console.log('[Puppeteer] Aguardando processamento da criacao...');
    await new Promise(r => setTimeout(r, 5000));
    
    let currentUrl = page.url();
    console.log(`[Puppeteer] URL apos tentativa: ${currentUrl}`);
    
    // Se ainda estiver na tela de criacao, tenta um ultimo clique forçado
    if (currentUrl.includes('/clients/new')) {
       console.log('[Puppeteer] Tentativa de clique forçado final...');
       await page.evaluate(() => {
         const btns = Array.from(document.querySelectorAll('button, input[type="submit"]'));
         const createBtn = btns.find(b => b.textContent?.toLowerCase().includes('criar') || (b as any).value?.toLowerCase().includes('criar')) as HTMLElement;
         if (createBtn) createBtn.click();
       });
       await new Promise(r => setTimeout(r, 3000));
       currentUrl = page.url();
    }

    if (currentUrl.includes('/clients/new')) {
       console.error('[Puppeteer] Erro: Permaneceu na pagina de criacao. Possivel erro de validacao.');
       const errorMsg = await page.evaluate(() => {
          const alert = document.querySelector('.alert, .text-danger, [class*="error"]');
          return alert ? alert.textContent?.trim() : 'Sem mensagem de erro visivel';
       });
       console.error(`[Puppeteer] Mensagem do painel: ${errorMsg}`);
    }
    if (!/\/clients\/\d+/.test(currentUrl)) {
      // Fallback: ir pra lista e procurar o cliente
      console.log('[Puppeteer] Sem redirect direto, buscando o cliente na lista...');
      await page.goto(`${BASE_URL}/clients`, { waitUntil: 'networkidle2' });
      await new Promise(r => setTimeout(r, 1500));
      await page.waitForSelector('input[type="search"]', { timeout: 10000 });
      await page.click('input[type="search"]', { clickCount: 3 });
      await page.type('input[type="search"]', finalUsername, { delay: 80 });
      await new Promise(r => setTimeout(r, 2000));
      
      const found = await page.evaluate((uname) => {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        const targetRow = rows.find(tr => tr.textContent?.includes(uname));
        if (targetRow) {
          const viewBtn = targetRow.querySelector('a[href*="/view"], a[title*="Visualizar"], .fa-eye') as HTMLElement;
          if (viewBtn) {
            viewBtn.click();
            return true;
          }
        }
        return false;
      }, finalUsername);

      if (!found) throw new Error(`Cliente ${finalUsername} criado mas nao encontrado na lista.`);
      
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));
    }

    // === STEP 4: clicar em "Ativar Player" ===
    console.log(`[Puppeteer] URL atual: ${page.url()}`);
    console.log('[Puppeteer] Clicando em "Ativar Player"...');
    let clickedActivate = false;
    for (let i = 0; i < 5; i++) {
      clickedActivate = await clickButtonByText(page, ['ativar player']);
      if (clickedActivate) break;
      console.log(`[Puppeteer] Tentativa ${i+1}: Botao "Ativar Player" nao apareceu, aguardando...`);
      await new Promise(r => setTimeout(r, 2000));
    }

    if (!clickedActivate) {
      throw new Error('Botao "Ativar Player" nao encontrado na pagina do cliente apos varias tentativas.');
    }
    await new Promise(r => setTimeout(r, 2000));

    // === STEP 5: selecionar player no dropdown do modal ===
    console.log(`[Puppeteer] Selecionando "${playerName}" no dropdown...`);
    const playerNameLower = playerName.toLowerCase();
    const playerSelected = await page.evaluate((needle) => {
      const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
      for (const select of selects) {
        for (let i = 0; i < select.options.length; i++) {
          if (select.options[i].text.toLowerCase().includes(needle)) {
            select.selectedIndex = i;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return select.options[i].text;
          }
        }
      }
      return null;
    }, playerNameLower);
    if (!playerSelected) {
      throw new Error(`Player "${playerName}" nao encontrado no dropdown do modal.`);
    }
    console.log(`[Puppeteer] Player selecionado: ${playerSelected}`);

    // === STEP 6: preencher MAC / Código ===
    console.log(`[Puppeteer] Preenchendo MAC/Código: ${mac}`);
    await new Promise(r => setTimeout(r, 800));
    
    const macTyped = await page.evaluate((textToType) => {
      // Busca todos os inputs dentro do modal
      const inputs = Array.from(document.querySelectorAll('.modal input, [role="dialog"] input')) as HTMLInputElement[];
      
      // Filtra pelo mais provavel (visivel e com placeholder/label relacionado)
      const target = inputs.find(input => {
        const style = window.getComputedStyle(input);
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && input.offsetWidth > 0;
        if (!isVisible) return false;
        
        const placeholder = (input.placeholder || '').toLowerCase();
        const label = (input.closest('.form-group')?.textContent || '').toLowerCase();
        const name = (input.name || '').toLowerCase();
        const id = (input.id || '').toLowerCase();

        return placeholder.includes('mac') || placeholder.includes('código') || placeholder.includes('aparelho') || placeholder.includes('digite') ||
               label.includes('mac') || label.includes('código') || label.includes('aparelho') ||
               name.includes('mac') || id.includes('mac') || name.includes('device') || id.includes('device');
      });

      if (target) {
        target.focus();
        target.value = ''; // Limpa
        target.value = textToType; // Define valor via JS (mais garantido)
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    }, mac);

    if (!macTyped) {
       // Fallback caso o evaluate falhe em achar (tentando seletor genérico)
       console.warn('[Puppeteer] Nao foi possivel preencher via JS inteligente, tentando fallback...');
       const genericInput = await page.$('.modal input[type="text"], .modal input:not([type="hidden"])');
       if (genericInput) {
          await genericInput.click({ clickCount: 3 });
          await genericInput.type(mac, { delay: 100 });
       } else {
          throw new Error('Input MAC/Código nao encontrado no modal.');
       }
    }

    // === STEP 7: confirmar ativacao ===
    console.log('[Puppeteer] Confirmando ativacao no modal...');
    const modalButtons = await page.$$('.modal button, [role="dialog"] button');
    let confirmClicked = false;
    for (const btn of modalButtons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text?.toLowerCase().includes('ativar player') ||
          text?.toLowerCase().includes('salvar') ||
          text?.toLowerCase().includes('confirmar')) {
        await btn.click();
        confirmClicked = true;
        break;
      }
    }
    if (!confirmClicked) {
      throw new Error('Botao confirmar do modal nao encontrado.');
    }

    await new Promise(r => setTimeout(r, 5000));
    console.log(`[Puppeteer] ✅ Teste 6h criado e ${playerName} ativado pra ${finalUsername}`);

    // Antes de retornar, tenta extrair as credenciais (usuario/senha) da tela de detalhes
    const creds = await extractCredentialsFromPage(page);
    console.log(`[Puppeteer] Credenciais extraídas (Teste): user=${creds.user}, pass=${creds.pass}`);

    return {
      success: true,
      message: `Cliente teste "${finalUsername}" criado e ${playerName} ativado com MAC ${mac}!`,
      username: creds.user || finalUsername,
      password: creds.pass,
      playerName,
      mac,
    };

  } catch (error: any) {
    console.error('[Puppeteer] Erro no teste 6h:', error.message);
    return {
      success: false,
      message: `Erro: ${error.message}`,
      username: finalUsername,
    };
  } finally {
    if (browser) {
      // keep browser open pra debug
    }
  }
}

// Helper compartilhado: procura botao com texto matching (case-insensitive substring)
// e clica. Retorna true se achou e clicou, false caso contrario.
export async function clickButtonByText(page: Page, needles: string[]): Promise<boolean> {
  // Tenta encontrar o seletor mais provavel para o botao
  const selector = await page.evaluate((texts) => {
    const elements = Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"]'));
    for (const el of elements as (HTMLElement | HTMLInputElement)[]) {
      const content = el.tagName === 'INPUT' ? (el as HTMLInputElement).value : el.textContent;
      const text = (content || '').toLowerCase().trim();
      if (texts.some(t => text.includes(t.toLowerCase()))) {
        const style = window.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0) {
          // Atribui um ID temporario pra gente clicar via seletor do Puppeteer (mais real)
          const id = 'btn_' + Math.random().toString(36).slice(2, 9);
          el.id = id;
          el.scrollIntoView();
          return '#' + id;
        }
      }
    }
    return null;
  }, needles);

  if (selector) {
    try {
      // Clique "real" do Puppeteer (move mouse, desce, sobe)
      await page.click(selector, { delay: 100 });
      await new Promise(r => setTimeout(r, 1000));
      return true;
    } catch (e) {
      // Fallback: clique via JS
      await page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLElement;
        if (el) el.click();
      }, selector);
      return true;
    }
  }
  return false;
}

/**
 * Helper para extrair Usuário e Senha da página de detalhes do cliente no CMS.
 */
export async function extractCredentialsFromPage(page: Page): Promise<{ user?: string, pass?: string }> {
  try {
    return await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('div, td, label, th, p, li, span'));
      let user = '';
      let pass = '';
      
      for (let i = 0; i < elements.length; i++) {
        const txt = elements[i].textContent?.trim() || '';
        
        // Match exato ou seguido de dois pontos para o rótulo
        if (/^usu[áa]rio:?$/i.test(txt)) {
          // 1. Tenta o próximo elemento irmão
          const nextVal = elements[i].nextElementSibling?.textContent?.trim();
          if (nextVal && nextVal.length >= 3) {
            user = nextVal;
          } else {
            // 2. Tenta o texto do próprio elemento pai removendo o rótulo
            const parentTxt = elements[i].parentElement?.textContent || '';
            const val = parentTxt.replace(txt, '').replace(':', '').trim();
            if (val && val.length >= 3) user = val;
          }
        }

        if (/^senha:?$/i.test(txt)) {
          const nextVal = elements[i].nextElementSibling?.textContent?.trim();
          if (nextVal && nextVal.length >= 3) {
            pass = nextVal;
          } else {
            const parentTxt = elements[i].parentElement?.textContent || '';
            const val = parentTxt.replace(txt, '').replace(':', '').trim();
            if (val && val.length >= 3) pass = val;
          }
        }
      }
      // Se não achou por rótulo isolado, tenta regex no body inteiro (brute force)
      if (!user) {
        const bodyTxt = document.body.innerText;
        const uMatch = bodyTxt.match(/usu[áa]rio:?\s*([a-z0-9_.-]+)/i);
        if (uMatch) user = uMatch[1];
      }
      if (!pass) {
        const bodyTxt = document.body.innerText;
        const pMatch = bodyTxt.match(/senha:?\s*([a-z0-9_.-]+)/i);
        if (pMatch) pass = pMatch[1];
      }

      return { user, pass };
    });
  } catch (e) {
    console.error('[Puppeteer] Erro ao extrair credenciais:', e);
    return {};
  }
}

/**
 * Busca a URL da lista (M3U) de um cliente no painel CMS
 */
export async function getClientPlaylistUrl(username: string): Promise<string | null> {
  let browser;
  try {
    browser = await launchBrowser(false); // Abre visivel para garantir
    const page = await browser.newPage();
    
    if (!(await loginToPanel(page))) {
      throw new Error('Falha no login ao painel CMS');
    }

    console.log(`[Puppeteer] Buscando URL da lista para: ${username}`);
    await page.goto(`${BASE_URL}/clients`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[type="search"]');
    await page.type('input[type="search"]', username);
    await new Promise(r => setTimeout(r, 2000));

    const found = await page.evaluate((uname) => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      const targetRow = rows.find(tr => tr.textContent?.includes(uname));
      if (targetRow) {
        const viewBtn = targetRow.querySelector('a[href*="/view"], a[title*="Visualizar"], .fa-eye') as HTMLElement;
        if (viewBtn) {
          viewBtn.click();
          return true;
        }
      }
      return false;
    }, username);

    if (!found) throw new Error('Cliente nao encontrado no painel.');

    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // Na pagina do cliente, procura o botao "Visualizar" da URL da lista
    // Geralmente abre um modal ou campo de texto
    const playlistUrl = await page.evaluate(() => {
      // Procura por um texto que pareça uma URL M3U ou o campo de "URL da lista"
      const elements = Array.from(document.querySelectorAll('td, span, div, input'));
      for (const el of elements) {
        const text = el.tagName === 'INPUT' ? (el as HTMLInputElement).value : el.textContent || '';
        if (text.includes('get.php') && text.includes('username=') && text.includes('password=')) {
          return text.trim();
        }
      }
      return null;
    });

    return playlistUrl;

  } catch (error: any) {
    console.error('[Puppeteer] Erro ao buscar URL da lista:', error.message);
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Automação de Suporte IBO Player: Atualiza a lista no site do IBO
 */
export async function supportIBOPlayer(mac: string, deviceKey: string, playlistUrl: string): Promise<any> {
  let browser;
  const sites = ['https://iboplayer.com/dashboard', 'https://iboiptv.com/dashboard'];
  
  try {
    browser = await launchBrowser(false); // Precisamos ver por causa do Captcha
    const page = await browser.newPage();

    let loggedIn = false;
    for (const site of sites) {
      console.log(`[Puppeteer] Tentando login no site: ${site}`);
      await page.goto(site, { waitUntil: 'networkidle2' });
      await new Promise(r => setTimeout(r, 3000));

      // NOVO: Dá um Refresh no Captcha logo de cara para garantir que é novo
      console.log('[Puppeteer] Forçando um Refresh no Captcha para garantir validade...');
      await clickButtonByText(page, ['Refresh Captcha', 'Atualizar Captcha']);
      await new Promise(r => setTimeout(r, 2000));

      // === NOVO: Lida com modais de Termos Legais / Welcome ===
      console.log('[Puppeteer] Verificando modais de termos...');
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const acceptBtn = buttons.find(b => 
          b.textContent?.toLowerCase().includes('accept') || 
          b.textContent?.toLowerCase().includes('agree') ||
          b.textContent?.toLowerCase().includes('entendi')
        ) as HTMLElement;
        if (acceptBtn) acceptBtn.click();
      }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));

      // === PASSO: Preenche MAC e Key com digitação simulada ===
      console.log('[Puppeteer] Preenchendo credenciais IBO (Tecla por Tecla)...');
      await page.waitForSelector('input', { timeout: 10000 }).catch(() => {});
      
      const inputsFound = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        return inputs.map((i, idx) => ({
          index: idx,
          placeholder: i.placeholder || '',
          name: i.name || '',
          id: i.id || '',
          type: i.type || ''
        }));
      });

      const macIdx = inputsFound.findIndex(i => i.placeholder.toLowerCase().includes('mac') || i.name.toLowerCase().includes('mac') || i.index === 0);
      const keyIdx = inputsFound.findIndex(i => i.placeholder.toLowerCase().includes('key') || i.name.toLowerCase().includes('key') || i.index === 1);

      if (macIdx !== -1) {
        const macInputs = await page.$$('input');
        const box = await macInputs[macIdx].boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { clickCount: 3 });
        }
        await page.keyboard.press('Backspace');
        await page.keyboard.type(mac, { delay: 200 });
      }

      await new Promise(r => setTimeout(r, 2000)); // Pausa humana entre campos

      if (keyIdx !== -1) {
        const allInputs = await page.$$('input');
        const box = await allInputs[keyIdx].boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { clickCount: 3 });
        }
        await page.keyboard.press('Backspace');
        await page.keyboard.type(deviceKey, { delay: 200 });
      }

      // === PASSO: Resolve Captcha com Gemini ===
      const geminiKey = process.env.GEMINI_API_KEY;
      if (geminiKey) {
        console.log('[Puppeteer] Tentando resolver Captcha com Gemini...');
        try {
          // Tira um print da area do formulario (onde o captcha esta visivel)
          console.log('[Puppeteer] Capturando area do formulario para o Gemini...');
          await new Promise(r => setTimeout(r, 2000)); // Espera carregar bem
          
          const screenshot = await page.screenshot({ encoding: 'base64' });
          const genAI = new GoogleGenerativeAI(geminiKey);
          const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
          const prompt = "Olhe para este formulario de login. Existe um campo de Captcha com uma imagem preta e letras coloridas/brancas. Qual é o texto desse captcha? Responda apenas com os caracteres.";
          
          const result = await model.generateContent([
            prompt,
            { inlineData: { data: screenshot as string, mimeType: "image/png" } }
          ]);
          
          const captchaText = result.response.text().trim().replace(/\s/g, '').toUpperCase();
          console.log(`[Puppeteer] Gemini identificou o Captcha via Visão Total: ${captchaText}`);
          
          // Preenche o captcha (geralmente o ultimo input do form)
          await page.evaluate((text) => {
            const inputs = Array.from(document.querySelectorAll('input'));
            const captchaInput = inputs[inputs.length - 1]; // O ultimo input costuma ser o captcha
            if (captchaInput) {
              captchaInput.focus();
            }
          }, captchaText);

          const allInputs = await page.$$('input');
          const lastInput = allInputs[allInputs.length - 1];
          const cbox = await lastInput.boundingBox();
          if (cbox) {
            await page.mouse.move(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2);
            await page.mouse.click(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2);
          }
          await page.keyboard.type(captchaText, { delay: 200 });
          
          console.log('[Puppeteer] Aguardando 5 segundos para o site processar o Captcha...');
          await new Promise(r => setTimeout(r, 5000));

          // Clica no Login com Mouse
          console.log('[Puppeteer] Clicando em LOGIN com Mouse...');
          const loginBtn = await page.evaluateHandle(() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            return btns.find(b => b.textContent?.toUpperCase().includes('LOGIN') || b.textContent?.toUpperCase().includes('ENTRAR'));
          });
          
          if (loginBtn) {
            const lBtn = loginBtn.asElement();
            if (lBtn) {
               const lbox = await lBtn.boundingBox();
               if (lbox) {
                 await page.mouse.move(lbox.x + lbox.width / 2, lbox.y + lbox.height / 2);
                 await page.mouse.click(lbox.x + lbox.width / 2, lbox.y + lbox.height / 2);
               }
            }
          }
          
          // === NOVO: Verifica se deu erro de Captcha para tentar o Refresh ===
          await new Promise(r => setTimeout(r, 3000));
          const hasCaptchaError = await page.evaluate(() => {
            return document.body.innerText.toLowerCase().includes('captcha is incorrect') || 
                   document.body.innerText.toLowerCase().includes('captcha incorreto');
          });

          if (hasCaptchaError) {
            console.log('[Puppeteer] Captcha incorreto detectado! Clicando em Refresh e tentando de novo...');
            await clickButtonByText(page, ['Refresh Captcha', 'Atualizar Captcha']);
            await new Promise(r => setTimeout(r, 2000));
            
            // Repete a lógica de visão (uma vez)
            const secondScreenshot = await page.screenshot({ encoding: 'base64' });
            const secondResult = await model.generateContent([
              prompt,
              { inlineData: { data: secondScreenshot as string, mimeType: "image/png" } }
            ]);
            const secondCaptchaText = secondResult.response.text().trim().replace(/\s/g, '').toUpperCase();
            console.log(`[Puppeteer] Segunda tentativa de Captcha: ${secondCaptchaText}`);

            await page.evaluate((text) => {
              const inputs = Array.from(document.querySelectorAll('input'));
              const captchaInput = inputs[inputs.length - 1] as HTMLInputElement;
              if (captchaInput) {
                captchaInput.focus();
                captchaInput.value = text;
                captchaInput.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }, secondCaptchaText);
            
            await page.keyboard.press('Tab');
            await page.keyboard.type(secondCaptchaText, { delay: 200 });
            
            console.log('[Puppeteer] Aguardando 5 segundos (retry) para o site processar o Captcha...');
            await new Promise(r => setTimeout(r, 5000));

            await clickButtonByText(page, ['LOGIN', 'Login', 'Entrar']);
          }
        } catch (err: any) {
          console.warn(`[Puppeteer] Nao foi possivel resolver captcha automaticamente: ${err.message}`);
        }
      }

      console.log('[Puppeteer] Aguardando resolução de Captcha (Manualmente se necessário)...');
      // Espera o dashboard carregar (indicando login com sucesso)
      try {
        await page.waitForFunction(() => 
          document.body.innerText.includes('Manage Playlists') || 
          document.body.innerText.includes('Playlist name'),
          { timeout: 60000 } // Dá 1 minuto para o captcha ser resolvido
        );
        loggedIn = true;
        break;
      } catch (e) {
        console.log(`[Puppeteer] Login falhou ou timeout no site ${site}. Capturando print de erro...`);
        const errorPath = path.join(process.cwd(), 'scratch', `ibo_error_${Date.now()}.png`);
        await page.screenshot({ path: errorPath });
        console.log(`[Puppeteer] Print de erro salvo em: ${errorPath}`);
        console.log(`[Puppeteer] Tentando próximo site se houver...`);
      }
    }

    if (!loggedIn) throw new Error('Nao foi possivel logar em nenhum dos sites do IBO.');

    // === PASSO: Manage Playlists ===
    console.log('[Puppeteer] Indo para Manage Playlists...');
    await clickButtonByText(page, ['Manage Playlists']);
    await new Promise(r => setTimeout(r, 2000));

    const editBtnHandle = await page.evaluateHandle(() => {
      // Procura por links ou botoes que contenham icones de edicao ou classes comuns
      const editBtn = document.querySelector('a[href*="edit"], .fa-edit, .fa-pencil, .blue-text i, i.fa-edit');
      if (editBtn) return editBtn;
      
      // Fallback: procura por qualquer icone azul na coluna de acoes
      const blueIcons = Array.from(document.querySelectorAll('i, svg')).filter(el => {
        const style = window.getComputedStyle(el);
        return style.color.includes('0, 0, 255') || style.color.includes('blue') || el.classList.contains('text-blue-500');
      });
      return blueIcons[0] || null;
    });

    let editClicked = false;
    const eBtn = editBtnHandle.asElement();
    if (eBtn) {
      const box = await eBtn.boundingBox();
      if (box) {
        console.log('[Puppeteer] Movendo mouse para o Lapis Azul...');
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        editClicked = true;
      }
    }

      if (!editClicked) {
        console.log('[Puppeteer] Icone de editar nao encontrado. Tentando "Add Playlist" ou "Add XC Playlist"...');
        await clickButtonByText(page, ['Add Playlist', 'Add XC Playlist']);
      }

      await new Promise(r => setTimeout(r, 2000));
      
      // Print para debug da tela de PIN/Edicao
      const debugPath = path.join(process.cwd(), 'scratch', `ibo_edit_screen_${Date.now()}.png`);
      await page.screenshot({ path: debugPath });
      console.log(`[Puppeteer] Debug da tela de edicao: ${debugPath}`);

    // Verifica se abriu o modal de PIN
    const pinInput = await page.waitForSelector('input[type="password"], input[placeholder*="PIN"], .pin-input', { timeout: 5000 }).catch(() => null);
    if (pinInput) {
      console.log('[Puppeteer] Inserindo PIN 654321...');
      await pinInput.type('654321', { delay: 200 });
      await page.keyboard.press('Enter');
      console.log('[Puppeteer] Aguardando 5 segundos para o formulario de edicao carregar...');
      await new Promise(r => setTimeout(r, 5000));
      
      // Tira um print para conferir se o form abriu
      const formPath = path.join(process.cwd(), 'scratch', `ibo_form_debug_${Date.now()}.png`);
      await page.screenshot({ path: formPath });
      console.log(`[Puppeteer] Screenshot do formulario: ${formPath}`);
    }

    // Preenche a URL da playlist
    console.log('[Puppeteer] Atualizando URL da Playlist...');
    const urlInput = await page.waitForSelector('input[name*="url"], input[placeholder*="http"], input[placeholder*="M3U"]', { timeout: 15000 });
    if (urlInput) {
      await urlInput.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await urlInput.type(playlistUrl, { delay: 20 });
    }

    // Preenche PIN e Confirm PIN se existirem no form de edicao
    await page.evaluate(() => {
      const pins = Array.from(document.querySelectorAll('input')).filter(i => i.placeholder?.includes('PIN') || i.type === 'password');
      pins.forEach(p => {
        (p as HTMLInputElement).value = '654321';
        p.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });

    // Salva
    console.log('[Puppeteer] Clicando em SAVE...');
    await clickButtonByText(page, ['SAVE', 'Save', 'Salvar', 'OK', 'Submit']);
    await new Promise(r => setTimeout(r, 5000));
    
    console.log('[Puppeteer] ✅ Suporte IBO concluído!');
    return { success: true, message: 'IBO Player atualizado com sucesso!' };
  } catch (error: any) {
    console.error(`[Puppeteer] Erro no suporte IBO: ${error.message}`);
    return { success: false, message: error.message };
  } finally {
    if (browser) await browser.close();
  }
}
