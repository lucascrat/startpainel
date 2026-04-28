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
