import 'dotenv/config';
import dotenv from 'dotenv';
import { Browser, Page } from 'puppeteer-core';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import os from 'os';
import path from 'path';
import OpenAI from "openai";

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
  username?: string;
  password?: string;
  mac?: string;
  playerName?: string;
}

export async function launchBrowser(headless = true, profileNum = 0): Promise<Browser> {
  const suffix = profileNum > 0 ? `-${profileNum}` : '';
  console.log(`[Puppeteer Stealth] Launching profile${suffix} with: ${CHROME_PATH}`);

  const baseDir = path.join(process.cwd(), 'puppeteer_data');
  const userDataDir = profileNum > 0 ? `${baseDir}${suffix}` : baseDir;
  
  // Real notebook resolutions
  const notebookWidths = [1366, 1440, 1536, 1920];
  const notebookHeights = [768, 900, 864, 1080];
  const randIdx = Math.floor(Math.random() * notebookWidths.length);
  const width = notebookWidths[randIdx];
  const height = notebookHeights[randIdx];

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless,
    userDataDir, // Usa um perfil dedicado com historico persistente
    ignoreDefaultArgs: ['--enable-automation'], // Esconde o aviso de automacao do Chrome
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      `--window-size=${width},${height}`,
      '--disable-infobars',
      '--disable-features=PasswordLeakDetection,SafeBrowsingChromePasswordProtection',
      '--password-store=basic',
      '--start-maximized',
      '--proxy-server=http://200.234.150.125:50100', // Proxy adicionado
      '--disable-blink-features=AutomationControlled',
      '--lang=pt-BR,pt,en-US,en'
    ],
    defaultViewport: null, // Deixa viewport real para despistar Cloudflare
  }) as unknown as Browser;

  const originalNewPage = browser.newPage.bind(browser);
  const pagesOpened: Page[] = [];

  browser.newPage = async function() {
    const p = await originalNewPage();
    pagesOpened.push(p);
    
    // Autenticação automática do proxy em cada nova página
    await p.authenticate({ username: 'lrlucasrafael11', password: 'F29LMZCpic' });
    
    // Dados de aparelho de um Notebook Real Windows
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    await p.setUserAgent(userAgent, {
      architecture: 'x86',
      bitness: '64',
      brands: [
        { brand: 'Chromium', version: '124' },
        { brand: 'Google Chrome', version: '124' },
        { brand: 'Not-A.Brand', version: '99' }
      ],
      fullVersionList: [
        { brand: 'Chromium', version: '124.0.6367.118' },
        { brand: 'Google Chrome', version: '124.0.6367.118' },
        { brand: 'Not-A.Brand', version: '99.0.0.0' }
      ],
      mobile: false,
      model: '',
      platform: 'Windows',
      platformVersion: '10.0.0',
    });
    
    await p.setExtraHTTPHeaders({
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Ch-Ua-Mobile': '?0',
    });

    await p.evaluateOnNewDocument(() => {
      // Mock navigator hardware concurrency & memory to look like a laptop
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      // Mock languages
      Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'] });
      // Add fake plugins to look like normal desktop
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
    });
    
    return p;
  };

  Object.defineProperty(browser, 'close', {
    value: async function() {
      console.log('[Puppeteer] Fechando abas abertas nesta sessão...');
      for (const p of pagesOpened) {
        try {
          if (!p.isClosed()) {
            await p.close().catch(() => {});
          }
        } catch (e) {}
      }
      console.log('[Puppeteer] Fechando navegador...');
      await browser.disconnect().catch(() => {});
    },
    writable: true,
    configurable: true
  });

  return browser;
}

// ---- INTERACTIVE BROWSER (VNC) ----
export let interactiveBrowser: Browser | null = null;
export let interactivePage: Page | null = null;

export async function startInteractiveBrowser() {
  if (interactiveBrowser) return true;
  try {
    interactiveBrowser = await launchBrowser(true, 0); // Headless = true, mas será visível pelo screenshot
    interactivePage = await interactiveBrowser.newPage();
    await interactivePage.setViewport({ width: 1280, height: 900 });
    await interactivePage.goto(BASE_URL, { waitUntil: 'networkidle2' });
    return true;
  } catch (e: any) {
    console.error('Erro ao iniciar interactive browser:', e.message);
    return false;
  }
}

export async function stopInteractiveBrowser() {
  if (interactiveBrowser) {
    await interactiveBrowser.close().catch(() => {});
    interactiveBrowser = null;
    interactivePage = null;
  }
}

export async function getInteractiveScreenshot(): Promise<Buffer | null> {
  if (!interactivePage) return null;
  try {
    return await interactivePage.screenshot({ type: 'jpeg', quality: 50 }) as Buffer;
  } catch (e) {
    return null;
  }
}

export async function sendInteractiveClick(x: number, y: number) {
  if (!interactivePage) return;
  try {
    await interactivePage.mouse.click(x, y);
  } catch (e) {}
}

export async function sendInteractiveType(text: string) {
  if (!interactivePage) return;
  try {
    // Se for string especial, podemos tratar. Ex: "Enter"
    if (text === 'Enter') {
      await interactivePage.keyboard.press('Enter');
    } else {
      await interactivePage.keyboard.type(text);
    }
  } catch (e) {}
}


export async function generateBrowserHistory(page: Page) {
  try {
    console.log('[Puppeteer] Gerando histórico de navegação para simular uso humano...');
    // Acessa o Google e faz uma pesquisa rápida
    await page.goto('https://www.google.com.br', { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Lista de pesquisas normais de um notebook
    const terms = ['notícias de hoje', 'previsão do tempo', 'youtube', 'tradutor', 'resultados futebol', 'calculadora', 'receita de bolo'];
    const search = terms[Math.floor(Math.random() * terms.length)];
    
    const searchBox = await page.$('textarea[name="q"], input[name="q"]');
    if (searchBox) {
      await searchBox.type(search, { delay: 100 });
      await page.keyboard.press('Enter');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    }

    // Rolar a página um pouco
    await page.evaluate(() => {
      window.scrollBy({ top: 500, behavior: 'smooth' });
    });
    await new Promise(r => setTimeout(r, 1500));
    console.log(`[Puppeteer] Pesquisou por "${search}" no Google.`);
  } catch (e: any) {
    console.log('[Puppeteer] Erro ao gerar histórico (ignorado):', e.message);
  }
}

export async function loginToPanel(page: Page): Promise<boolean> {
  const loginUrl = `${BASE_URL}/login`;

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  });

  // Estamos logados se a URL NAO contem /login
  const isLoggedIn = () => !page.url().includes('/login');

  // Com 20% de chance, fazemos um aquecimento de histórico antes do login
  if (Math.random() < 0.20) {
    await generateBrowserHistory(page);
  }

  // Ate 2 tentativas — login pode falhar transitoriamente (rede, render lento)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`[Puppeteer] Login tentativa ${attempt}/2...`);

      // 1. Vai pra home — se ja tem sessao ativa, nao cai no /login
      await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
      if (isLoggedIn()) {
        console.log('[Puppeteer] Sessao ativa encontrada! Pulando login.');
        return true;
      }

      // 2. Garante que estamos na pagina de login
      if (!page.url().includes('/login')) {
        await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      }

      if (!ADMIN_USER || !ADMIN_PASS) {
        console.error('[Puppeteer] STARTPAINEL_ADMIN_USER/PASS vazios no .env do worker! Configure e reinicie.');
        return false;
      }

      // 3. Preenche credenciais (seletores tolerantes a mudanca de id/name)
      const userSelector = 'input#username, input[name="username"], input[type="text"]:not([type="search"])';
      const passSelector = 'input#password, input[name="password"], input[type="password"]';
      await page.waitForSelector(passSelector, { timeout: 60000 });

      await page.click(userSelector, { clickCount: 3 }).catch(() => {});
      await page.type(userSelector, ADMIN_USER, { delay: 60 });
      await page.click(passSelector, { clickCount: 3 }).catch(() => {});
      await page.type(passSelector, ADMIN_PASS, { delay: 60 });

      // 4. Submete: clica no botao; se nao achar, envia via Enter (form submit)
      const loginBtnSelector = 'button#loginbtn, button[type="submit"], input[type="submit"]';
      const navPromise = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      const btn = await page.$(loginBtnSelector);
      if (btn) {
        await btn.click().catch(() => {});
      } else {
        console.log('[Puppeteer] Botao de login nao encontrado — enviando via Enter.');
        await page.keyboard.press('Enter');
      }
      await navPromise;

      // 5. Confirma saida do /login com polling (ate 12s) — cobre login SPA/lento
      for (let i = 0; i < 12; i++) {
        if (isLoggedIn()) {
          console.log('[Puppeteer] Login OK.');
          return true;
        }
        await new Promise(r => setTimeout(r, 1000));
      }

      console.warn(`[Puppeteer] Ainda na tela de login apos tentativa ${attempt}. URL=${page.url()}`);
    } catch (e: any) {
      console.error(`[Puppeteer] Erro no login (tentativa ${attempt}):`, e?.message || e);
    }
  }

  console.error('[Puppeteer] Falha no login apos 2 tentativas (verifique credenciais / captcha na tela do worker).');
  return false;
}

export async function renewClientPuppeteer(username: string, profileNum = 0): Promise<RenewalResult> {
  if (!ADMIN_USER || !ADMIN_PASS) {
    return { success: false, message: 'Credenciais não configuradas' };
  }

  let browser: Browser | null = null;
  try {
    console.log(`\n[Puppeteer] === Iniciando renovação para: ${username} ===`);
    browser = await launchBrowser(false, profileNum); 
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


/**
 * Altera a data de expiração de um cliente via "Plano Personalizado" no painel.
 * @param username  username do cliente
 * @param newDate   nova data no formato YYYY-MM-DD
 * @param profileNum perfil Chrome do worker (1-5)
 */
export async function setCustomExpirationPuppeteer(
  username: string,
  newDate: string,   // YYYY-MM-DD
  profileNum = 0
): Promise<RenewalResult> {
  if (!ADMIN_USER || !ADMIN_PASS) return { success: false, message: 'Credenciais não configuradas' };

  let browser: Browser | null = null;
  try {
    console.log(`\n[Puppeteer] === Alterando expiração de ${username} para ${newDate} ===`);
    browser = await launchBrowser(false, profileNum);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    const loggedIn = await loginToPanel(page);
    if (!loggedIn) return { success: false, message: 'Login falhou no painel' };

    // 1. Busca o cliente
    await page.goto(`${BASE_URL}/clients`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[type="search"]', { timeout: 15000 });
    await page.click('input[type="search"]', { clickCount: 3 });
    await page.type('input[type="search"]', username, { delay: 80 });
    await new Promise(r => setTimeout(r, 1800));

    // 2. Clica no botão Extender da linha do cliente
    const clicked = await page.evaluate((uname: string) => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      const row = rows.find(tr => Array.from(tr.querySelectorAll('td')).some(td => td.textContent?.trim() === uname));
      if (!row) return false;
      const btn = row.querySelector('a[data-original-title="Extender"], a[title="Extender"], a[href*="extend"]') as HTMLElement | null;
      if (btn) { btn.click(); return true; }
      return false;
    }, username);

    if (!clicked) return { success: false, message: `Cliente "${username}" não encontrado na lista` };

    // 3. Aguarda o modal aparecer
    await page.waitForSelector('.modal.show, .modal[style*="block"]', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 800));

    // 4. Seleciona "Personalizado" no select
    await page.evaluate(() => {
      const modal = document.querySelector('.modal.show') as HTMLElement;
      const sel = modal?.querySelector('select') as HTMLSelectElement;
      if (sel) {
        sel.value = 'custom';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await new Promise(r => setTimeout(r, 600));

    // 5. Seta a data no input[name="customDate"] (formato YYYY-MM-DD)
    await page.evaluate((date: string) => {
      const modal = document.querySelector('.modal.show') as HTMLElement;
      const input = modal?.querySelector('input[name="customDate"]') as HTMLInputElement;
      if (!input) return;
      const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      nativeSet?.call(input, date);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, newDate);
    await new Promise(r => setTimeout(r, 400));

    // 6. Confirma clicando em "Extender"
    await page.evaluate(() => {
      const btn = document.querySelector('.modal.show .extendButton, .modal.show button.btn-success') as HTMLElement | null;
      btn?.click();
    });
    await new Promise(r => setTimeout(r, 3000));

    return {
      success: true,
      message: `✅ Expiração de "${username}" alterada para ${newDate} com sucesso!`,
      screenshotBase64: await page.screenshot({ encoding: 'base64' }) as string,
    };

  } catch (e: any) {
    return { success: false, message: `Erro: ${e?.message}` };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

export async function renewClientPuppeteerVisible(username: string, profileNum = 0): Promise<RenewalResult> {
  let browser: Browser | null = null;
  try {
    browser = await launchBrowser(false, profileNum);
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

export async function createClientAndGetPlaylist(username: string, profileNum = 0): Promise<RenewalResult> {
  let browser: Browser | null = null;
  try {
    console.log(`\n[Puppeteer] === Iniciando criação de cliente: ${username} ===`);
    browser = await launchBrowser(false, profileNum);
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
export async function activatePlayer(username: string, mac: string, playerName: string, profileNum = 0): Promise<RenewalResult> {
  let browser: Browser | null = null;
  try {
    console.log(`\n[Puppeteer] === Ativando "${playerName}" para: ${username} (MAC: ${mac}) ===`);
    browser = await launchBrowser(false, profileNum);
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
    // DataTables sempre mantem a row "Nenhum registro encontrado" no DOM (oculta com
    // display:none quando ha resultados). Por isso só conta como "vazio" quando ela
    // estiver VISIVEL (offsetParent !== null).
    const searchResult = await page.evaluate(() => {
      const emptyCell = document.querySelector('td.dataTables_empty, .dataTables_empty') as HTMLElement | null;
      if (emptyCell && emptyCell.offsetParent !== null) {
        return { found: false, hint: emptyCell.textContent?.trim() || 'no results cell visible' };
      }
      const rows = Array.from(document.querySelectorAll('tbody tr')) as HTMLElement[];
      // Conta só rows visíveis com dado real
      const dataRows = rows.filter(tr => {
        if (tr.offsetParent === null) return false; // oculta
        const txt = tr.textContent?.toLowerCase() || '';
        if (txt.includes('no data') || txt.includes('no matching') ||
            txt.includes('nenhum registro') || txt.includes('nenhum resultado') ||
            txt.includes('sem registros')) return false;
        const cells = tr.querySelectorAll('td');
        return cells.length >= 2;
      });
      return { found: dataRows.length > 0, hint: `${dataRows.length} linha(s) visível(eis)` };
    });

    if (!searchResult.found) {
      console.log(`[Puppeteer] Cliente "${username}" nao encontrado (${searchResult.hint}).`);
      return {
        success: false,
        message: `Cliente "${username}" nao foi encontrado no painel CMS. Confira se o username esta correto.`,
      };
    }

    // 3. Click "Detalhes" / "Visualizar" — clica no botão da row do cliente certo
    // (alguns layouts do CMS rotulam Detalhes, outros Visualizar)
    console.log('[Puppeteer] Clicando em Detalhes/Visualizar...');
    const clickedView = await page.evaluate((uname: string) => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      const target = rows.find(tr => {
        if ((tr as HTMLElement).offsetParent === null) return false;
        return Array.from(tr.querySelectorAll('td')).some(td => (td.textContent || '').trim() === uname);
      });
      if (!target) return false;
      // Procura botão de "Detalhes" ou "Visualizar" dentro da row
      const btn = target.querySelector(
        'a[data-original-title="Detalhes"], a[title="Detalhes"], ' +
        'a[data-original-title="Visualizar"], a[title="Visualizar"], ' +
        'a[href*="/view"], .fa-eye'
      ) as HTMLElement | null;
      if (btn) { btn.click(); return true; }
      // Fallback: clica no primeiro botão de ação que vai pra /clients/ID (sem sufixo)
      const links = Array.from(target.querySelectorAll('a[href]')) as HTMLAnchorElement[];
      const detailLink = links.find(a => /\/clients\/\d+$/.test(a.getAttribute('href') || ''));
      if (detailLink) { detailLink.click(); return true; }
      return false;
    }, username);

    if (!clickedView) {
      throw new Error('Botao Detalhes/Visualizar nao encontrado (cliente foi encontrado mas selector do botao nao bate). Pode ser que o CMS atualizou — me avisa.');
    }

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
export async function activateUltraPlayer(username: string, mac: string, profileNum = 0): Promise<RenewalResult> {
  return activatePlayer(username, mac, 'Ultra Player', profileNum);
}

export async function activateFunPlay(username: string, mac: string, profileNum = 0): Promise<RenewalResult> {
  return activatePlayer(username, mac, 'Fun Play', profileNum);
}

/**
 * Lazer Play / FocoX Play — mesma opção no painel.
 * O dropdown mostra "Lazer Play / FocoX Play" (value="lazer_start").
 */
export async function activateLazerPlay(username: string, mac: string, profileNum = 0): Promise<RenewalResult> {
  return activatePlayer(username, mac, 'lazer', profileNum);
}

export async function activateXCloud(username: string, mac: string, profileNum = 0): Promise<RenewalResult> {
  return activatePlayer(username, mac, 'X-Cloud', profileNum);
}

export async function activateSeePlay(username: string, mac: string, profileNum = 0): Promise<RenewalResult> {
  return activatePlayer(username, mac, 'See Play', profileNum);
}

/**
 * Varre TODOS os clientes do painel e retorna array com dados parseados.
 * Pegue o nome de cada cliente, status, expiração, senha IPTV, MAC, app, telefone
 * extraídos do campo "Comentários" do painel.
 *
 * Retorna até `maxClients` clientes (padrão 200).
 */
export interface PanelClientSync {
  username: string;
  panelId: string;
  password: string | null;
  expirationDate: string | null;  // YYYY-MM-DD
  linesCount: number;
  status: 'active' | 'expired';
  name: string | null;
  whatsapp: string | null;
  appName: string | null;
  appMac: string | null;
  appPassword: string | null;
}

export async function syncAllPanelClients(
  profileNum = 0,
  maxClients = 200
): Promise<{ success: boolean; clients?: PanelClientSync[]; message: string }> {
  let browser: Browser | null = null;
  try {
    console.log('[Sync] === Sincronizando todos os clientes do painel ===');
    browser = await launchBrowser(false, profileNum);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    const loggedIn = await loginToPanel(page);
    if (!loggedIn) return { success: false, message: 'Login no painel falhou.' };

    // Vai pra lista e expande pra 50/página
    await page.goto(`${BASE_URL}/clients`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => {
      const sel = document.querySelector('select') as HTMLSelectElement | null;
      if (sel) { sel.value = '50'; sel.dispatchEvent(new Event('change')); }
    });
    await new Promise(r => setTimeout(r, 1500));

    // Coleta IDs de todas as páginas
    const allIds: string[] = [];
    let pageNum = 1;
    const maxPages = 20;
    while (pageNum <= maxPages) {
      const ids = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tbody tr'));
        return rows
          .filter(tr => (tr as HTMLElement).offsetParent !== null && tr.querySelector('a[href*="/clients/"]'))
          .map(tr => {
            const link = tr.querySelector('a[href*="/clients/"]') as HTMLAnchorElement;
            const m = link?.getAttribute('href')?.match(/\/clients\/(\d+)$/);
            return m ? m[1] : null;
          })
          .filter((x): x is string => !!x);
      });
      for (const id of ids) if (!allIds.includes(id)) allIds.push(id);

      // Tenta ir pra próxima página
      const advanced = await page.evaluate(() => {
        const next = Array.from(document.querySelectorAll('.paginate_button.next, a.next, [data-action="next"]'))
          .find(e => !(e.classList.contains('disabled'))) as HTMLElement | null;
        if (next && next.offsetParent !== null) { next.click(); return true; }
        return false;
      });
      if (!advanced) break;
      pageNum++;
      await new Promise(r => setTimeout(r, 1200));
    }
    console.log(`[Sync] ${allIds.length} clientes encontrados em ${pageNum} página(s)`);

    // Faz fetch de cada cliente e parseia (mesma lógica do import-clients-from-panel.ts)
    const clients: PanelClientSync[] = [];
    const usernames: string[] = [];
    let processed = 0;
    for (const id of allIds.slice(0, maxClients)) {
      try {
        const data = await page.evaluate(async (cid: string) => {
          const resp = await fetch(`/clients/${cid}`);
          const html = await resp.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const vals = Array.from(doc.querySelectorAll('.col-6.col-lg-8'))
            .map(el => (el as HTMLElement).innerText.trim())
            .filter(t => t && !t.includes('Visualizar') && !t.includes('Ativar Player'));
          return { vals, panelId: cid };
        }, id);

        if (!data?.vals?.length) continue;
        const v = data.vals;
        const username = v[0] || '';
        const password = v[1] || null;
        const connRaw = v[3] || '';
        const linesCount = parseInt((connRaw.match(/\/\s*(\d+)/) || [])[1] || '1');
        const expRaw = v[5] || v[6] || '';
        let expirationDate: string | null = null;
        const dm = expRaw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (dm) expirationDate = `${dm[3]}-${dm[2]}-${dm[1]}`;
        const commentsRaw = v[6] || v[7] || '';

        let status: 'active' | 'expired' = 'active';
        if (expirationDate && new Date(expirationDate) < new Date()) status = 'expired';

        // Parse comentários: nome, telefone, app, mac, senha app
        let name: string | null = null, whatsapp: string | null = null;
        let appName: string | null = null, appMac: string | null = null, appPassword: string | null = null;
        const lines = commentsRaw.split('\n').map(l => l.trim()).filter(l => l.length > 0 && l.length < 120);
        let i = 0;
        while (i < lines.length) {
          const line = lines[i];
          const labelOnly = line.match(/^(telefone|fone|cel|celular|app\s+que\s+usa|app|mac\s+address|mac|senha|device\s+key)\s*:?\s*$/i);
          const labelWithVal = line.match(/^(telefone|fone|cel|celular|app\s+que\s+usa|app|mac\s+address|mac|senha|device\s+key)\s*:\s*(.+)/i);
          const phoneRaw = !labelOnly && !labelWithVal && line.match(/^[\+\d][\d\s()\-]{7,}$/);
          const macRaw = !labelOnly && !labelWithVal && line.match(/^([0-9a-fA-F]{2}[:\-]){5}[0-9a-fA-F]{2}$/i);
          if (labelOnly) {
            const lbl = labelOnly[1].toLowerCase().replace(/\s+/g, '');
            const val = lines[i + 1] || '';
            if (lbl.includes('telefone') || lbl === 'fone' || lbl.startsWith('cel')) { if (!whatsapp) whatsapp = val; }
            else if (lbl.includes('app')) { if (!appName) appName = val; }
            else if (lbl.includes('mac')) { if (!appMac) appMac = val; }
            else if (lbl === 'senha') { if (!appPassword) appPassword = val; }
            i += 2; continue;
          } else if (labelWithVal) {
            const lbl = labelWithVal[1].toLowerCase().replace(/\s+/g, '');
            const val = labelWithVal[2].trim();
            if (lbl.includes('telefone') || lbl === 'fone' || lbl.startsWith('cel')) { if (!whatsapp) whatsapp = val; }
            else if (lbl.includes('app')) { if (!appName) appName = val; }
            else if (lbl.includes('mac')) { if (!appMac) appMac = val; }
            else if (lbl === 'senha') { if (!appPassword) appPassword = val; }
          } else if (phoneRaw && !whatsapp) { whatsapp = line; }
          else if (macRaw && !appMac) { appMac = line; }
          else if (!name && line.length >= 2 && line.length < 80) { name = line; }
          i++;
        }

        clients.push({
          username, panelId: data.panelId,
          password, expirationDate, linesCount, status,
          name, whatsapp, appName, appMac, appPassword,
        });
        usernames.push(username);
      } catch (e: any) {
        console.warn(`[Sync] erro no cliente ${id}: ${e?.message?.substring(0, 60)}`);
      }
      processed++;
      if (processed % 20 === 0) console.log(`[Sync] ${processed}/${allIds.length} processados`);
    }

    console.log(`[Sync] ✅ ${clients.length} clientes sincronizados`);
    return { success: true, clients, message: `${clients.length} clientes sincronizados do painel.` };
  } catch (e: any) {
    console.error('[Sync] erro:', e?.message);
    return { success: false, message: e?.message || 'Erro inesperado.' };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/**
 * Deleta testes expirados (não convertidos) no painel CMS.
 *
 * Usa o botão nativo "Deletar Expirados" do painel, que abre um modal:
 *   - clientType: 'trial' (meus testes) | 'official' (meus clientes)
 *   - period:     'day' (últimas 24h) | 'month' (esse mês) | 'all' (qualquer dia)
 *
 * Padrão: limpa testes expirados nas últimas 24h.
 */
export async function deleteExpiredTrials(
  options: { clientType?: 'trial' | 'official'; period?: 'day' | 'month' | 'all' } = {},
  profileNum = 0
): Promise<RenewalResult> {
  const clientType = options.clientType || 'trial';
  const period = options.period || 'day';

  let browser: Browser | null = null;
  try {
    console.log(`[Puppeteer] === Deletando ${clientType}/${period} no CMS ===`);
    browser = await launchBrowser(false, profileNum);
    const page = await browser.newPage();

    const loggedIn = await loginToPanel(page);
    if (!loggedIn) return { success: false, message: 'Login no painel falhou.' };

    // Vai para a lista de clientes
    await page.goto(`${BASE_URL}/clients`, { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));

    // Clica em "Deletar Expirados"
    const opened = await page.evaluate(() => {
      const link = Array.from(document.querySelectorAll('a')).find(a => /deletar\s+expirados/i.test(a.textContent || ''));
      if (link) { (link as HTMLElement).click(); return true; }
      return false;
    });
    if (!opened) return { success: false, message: 'Botão "Deletar Expirados" não encontrado no painel.' };

    // Aguarda modal
    await page.waitForSelector('.modal.show, .modal[style*="block"]', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 800));

    // Seleciona clientType e period
    await page.evaluate((ct: string, p: string) => {
      const modal = document.querySelector('.modal.show, .modal[style*="block"]') as HTMLElement;
      const selects = modal?.querySelectorAll('select');
      if (!selects) return;
      selects.forEach((s) => {
        const sel = s as HTMLSelectElement;
        if (sel.name === 'clientType') {
          sel.value = ct;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (sel.name === 'period') {
          sel.value = p;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }, clientType, period);
    await new Promise(r => setTimeout(r, 400));

    // Clica DELETAR (confirma a ação)
    const confirmed = await page.evaluate(() => {
      const modal = document.querySelector('.modal.show, .modal[style*="block"]') as HTMLElement;
      const btn = Array.from(modal?.querySelectorAll('button') || []).find(b => /^deletar$/i.test(b.textContent?.trim() || ''));
      if (btn) { (btn as HTMLElement).click(); return true; }
      return false;
    });
    if (!confirmed) return { success: false, message: 'Botão DELETAR do modal não encontrado.' };

    // Aguarda processamento (pode demorar se tiver muitos)
    await new Promise(r => setTimeout(r, 6000));

    console.log(`[Puppeteer] ✅ Limpeza ${clientType}/${period} executada.`);
    return { success: true, message: `Limpeza executada: clientType=${clientType}, period=${period}` };

  } catch (e: any) {
    console.error('[Puppeteer] Erro ao deletar expirados:', e?.message);
    return { success: false, message: e?.message || 'Erro inesperado.' };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/**
 * Família Quick: uma única opção no painel ativa todos os apps abaixo:
 *  - Quick Player
 *  - Quick Player PRO
 *  - QPlay
 *  - Big Player
 * O texto exato no dropdown é "Quick Player / Quick Player PRO / QPlay / Big Player"
 * (value="quick_start"). Matching por substring "quick" é suficiente.
 */
export async function activateQuickPlay(username: string, mac: string, profileNum = 0): Promise<RenewalResult> {
  return activatePlayer(username, mac, 'quick', profileNum);
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
  profileNum = 0,
): Promise<RenewalResult & { username?: string; playerName?: string; mac?: string }> {
  let browser: Browser | null = null;
  const finalUsername = (username && username.trim()) || `Teste${Date.now().toString().slice(-7)}`;

  try {
    console.log(`\n[Puppeteer] === Teste 6h: criando ${finalUsername} + ativando ${playerName} (MAC: ${mac}) ===`);
    browser = await launchBrowser(false, profileNum);
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
    await page.waitForSelector('input[name="username"], input[type="text"]', { timeout: 60000 });
    await page.evaluate((val) => {
      const inputs = Array.from(document.querySelectorAll('input[name="username"], input[type="text"]')) as HTMLInputElement[];
      // pega o primeiro visivel
      const visible = inputs.find(i => i.offsetParent !== null && !i.placeholder?.toLowerCase().includes('search'));
      if (visible) {
        visible.value = '';
        visible.focus();
      }
    }, finalUsername);
    const userInputs = await page.$$('input[name="username"], input[type="text"]');
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
       try {
         await page.evaluate(() => {
           const btns = Array.from(document.querySelectorAll('button, input[type="submit"]'));
           const createBtn = btns.find(b => b.textContent?.toLowerCase().includes('criar') || (b as any).value?.toLowerCase().includes('criar')) as HTMLElement;
           if (createBtn) createBtn.click();
         });
       } catch (err: any) {
         if (!err.message.includes('Execution context was destroyed')) {
           throw err;
         }
         console.log('[Puppeteer] Navegação detectada durante o clique forçado.');
       }
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
       // Detecta se o erro é de username já existente — retorna código identificável
       const errLower = (errorMsg || '').toLowerCase();
       if (errLower.includes('already') || errLower.includes('existe') || errLower.includes('duplicado') || errLower.includes('taken') || errLower.includes('em uso') || errLower.includes('cadastrado')) {
         return { success: false, message: `USERNAME_ALREADY_EXISTS: ${finalUsername}` };
       }
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

    const isSmartOne = playerName.toLowerCase().includes('smartone') || playerName.toLowerCase().includes('smart-one') || playerName.toLowerCase().includes('smart one');
    const isVUPro = playerName.toLowerCase().includes('vu') || playerName.toLowerCase().includes('vupro') || playerName.toLowerCase().includes('vu player');
    if (isSmartOne || isVUPro) {
      console.log(`[Puppeteer] ${isSmartOne ? 'SmartOne' : 'VU Player Pro'} detectado. Extraindo URL da playlist M3U e pulando ativação do CMS...`);
      
      // Clica no botão/link "Visualizar" para exibir os dados da lista no modal
      await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('a, button, span, div, td')) as HTMLElement[];
        const viewBtn = elements.find(el => el.textContent?.trim() === 'Visualizar');
        if (viewBtn) viewBtn.click();
      });
      await new Promise(r => setTimeout(r, 2000));

      const playlistUrl = await page.evaluate(() => {
        // Tenta pegar direto do textarea/input com id="url" ou id="lastUrl"
        const urlEl = document.querySelector('#url, #lastUrl, [name="url"]') as HTMLInputElement | HTMLTextAreaElement;
        if (urlEl && urlEl.value && urlEl.value.includes('get.php')) {
          return urlEl.value.trim();
        }

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
      
      const creds = await extractCredentialsFromPage(page);
      
      return {
        success: true,
        message: `Cliente teste "${finalUsername}" criado com sucesso no CMS.`,
        username: creds.user || finalUsername,
        password: creds.pass,
        playlistUrl: playlistUrl || undefined,
        playerName,
        mac,
      };
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
    let playlistUrl = await page.evaluate(() => {
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

    if (!playlistUrl) {
      console.log('[Puppeteer] URL não visível diretamente. Tentando clicar em "Visualizar" para abrir o modal...');
      await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('a, button, span, div, td')) as HTMLElement[];
        const viewBtn = elements.find(el => el.textContent?.trim() === 'Visualizar');
        if (viewBtn) viewBtn.click();
      });
      await new Promise(r => setTimeout(r, 2000));

      playlistUrl = await page.evaluate(() => {
        // Tenta pegar direto do textarea/input com id="url" ou id="lastUrl"
        const urlEl = document.querySelector('#url, #lastUrl, [name="url"]') as HTMLInputElement | HTMLTextAreaElement;
        if (urlEl && urlEl.value && urlEl.value.includes('get.php')) {
          return urlEl.value.trim();
        }

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
    }

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

      // === PASSO: Resolve Captcha com OpenAI Vision ===
      const openaiKey = process.env.OPENAI_API_KEY;
      if (openaiKey) {
        console.log('[Puppeteer] Tentando resolver Captcha com OpenAI Vision...');
        try {
          console.log('[Puppeteer] Capturando area do formulario para OpenAI...');
          await new Promise(r => setTimeout(r, 2000)); // Espera carregar bem

          const screenshot = await page.screenshot({ encoding: 'base64' });
          const openai = new OpenAI({ apiKey: openaiKey });
          const result = await openai.chat.completions.create({
            model: 'gpt-4.1-mini',
            messages: [{ role: 'user', content: [
              { type: 'text', text: 'Olhe para este formulario de login. Existe um campo de Captcha com uma imagem preta e letras coloridas/brancas. Qual é o texto desse captcha? Responda apenas com os caracteres.' },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshot}`, detail: 'low' } },
            ]}],
            max_tokens: 20,
          });

          const captchaText = (result.choices[0]?.message?.content || '').trim().replace(/\s/g, '').toUpperCase();
          console.log(`[Puppeteer] OpenAI identificou o Captcha: ${captchaText}`);
          
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
            const secondResult = await openai.chat.completions.create({
              model: 'gpt-4.1-mini',
              messages: [{ role: 'user', content: [
                { type: 'text', text: 'Olhe para este formulario de login. Existe um campo de Captcha com uma imagem preta e letras coloridas/brancas. Qual é o texto desse captcha? Responda apenas com os caracteres.' },
                { type: 'image_url', image_url: { url: `data:image/png;base64,${secondScreenshot}`, detail: 'low' } },
              ]}],
              max_tokens: 20,
            });
            const secondCaptchaText = (secondResult.choices[0]?.message?.content || '').trim().replace(/\s/g, '').toUpperCase();
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
