import puppeteer, { Browser, Page } from 'puppeteer-core';
import os from 'os';

// Detect OS and set default Chrome path
const isWindows = os.platform() === 'win32';
const DEFAULT_CHROME_PATH = isWindows 
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : '/usr/bin/chromium'; // Default for many Linux distros

const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || DEFAULT_CHROME_PATH;
const BASE_URL = process.env.STARTPAINEL_URL || 'https://cms.startpainel.cc';
const ADMIN_USER = process.env.STARTPAINEL_ADMIN_USER || '';
const ADMIN_PASS = process.env.STARTPAINEL_ADMIN_PASS || '';

export interface RenewalResult {
  success: boolean;
  message: string;
  clientId?: string;
  screenshotBase64?: string;
}

async function launchBrowser(headless = true): Promise<Browser> {
  console.log(`[Puppeteer] Launching browser with path: ${CHROME_PATH}`);
  return puppeteer.launch({
    executablePath: CHROME_PATH,
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,900',
    ],
    defaultViewport: { width: 1280, height: 900 },
  });
}

async function loginToPanel(page: Page): Promise<boolean> {
  console.log('[Puppeteer] Navegando para página de login...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2', timeout: 30000 });

  // Aguarda os campos do formulário
  await page.waitForSelector('input[name="username"], input#username', { timeout: 10000 });

  console.log('[Puppeteer] Preenchendo credenciais...');
  
  // Limpa e preenche usuário
  const userSelector = 'input[name="username"], input#username';
  await page.click(userSelector, { clickCount: 3 });
  await page.type(userSelector, ADMIN_USER, { delay: 50 });

  // Limpa e preenche senha
  const passSelector = 'input[name="password"], input#password';
  await page.click(passSelector, { clickCount: 3 });
  await page.type(passSelector, ADMIN_PASS, { delay: 50 });

  console.log('[Puppeteer] Clicando em Entrar...');
  
  // Clica no botão de login e aguarda navegação
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }),
    page.click('button[type="submit"], input[type="submit"], button:has-text("Entrar")')
      .catch(() => page.keyboard.press('Enter'))
  ]);

  const currentUrl = page.url();
  console.log(`[Puppeteer] Pós-login URL: ${currentUrl}`);
  
  // Verifica se saiu da página de login (= login bem-sucedido)
  const isLoggedIn = !currentUrl.includes('/login');
  if (!isLoggedIn) {
    // Captura mensagem de erro se existir
    const errMsg = await page.$eval(
      '.alert-danger, .alert.alert-error, [class*="error"], [class*="invalid"]',
      (el) => el.textContent?.trim() || ''
    ).catch(() => '');
    console.error('[Puppeteer] Login falhou. Mensagem:', errMsg || 'URL ainda é /login');
  } else {
    console.log('[Puppeteer] Login bem-sucedido!');
  }
  
  return isLoggedIn;
}

async function findClientIdOnPage(page: Page, username: string): Promise<string | null> {
  console.log(`[Puppeteer] Buscando cliente "${username}"...`);
  
  await page.goto(`${BASE_URL}/clients?search=${encodeURIComponent(username)}`, {
    waitUntil: 'networkidle2',
    timeout: 20000
  });

  // Tenta encontrar link para o cliente na tabela
  const clientId = await page.evaluate((uname: string) => {
    // Procura por links /clients/ID/edit ou /clients/ID/show
    const links = Array.from(document.querySelectorAll('a[href*="/clients/"]'));
    for (const link of links) {
      const href = (link as HTMLAnchorElement).href;
      const match = href.match(/\/clients\/(\d+)\/(edit|show|renew|info|duplicate)/);
      if (match) return match[1];
    }

    // Procura por atributos data-id na linha da tabela que contém o username
    const rows = Array.from(document.querySelectorAll('tr, [class*="row"]'));
    for (const row of rows) {
      if (row.textContent?.toLowerCase().includes(uname.toLowerCase())) {
        const dataId = row.getAttribute('data-id') || row.getAttribute('id');
        if (dataId && /^\d+$/.test(dataId)) return dataId;
        // Tenta pegar do link dentro da linha
        const rowLink = row.querySelector('a[href*="/clients/"]') as HTMLAnchorElement | null;
        if (rowLink) {
          const m = rowLink.href.match(/\/clients\/(\d+)/);
          if (m) return m[1];
        }
      }
    }
    return null;
  }, username);

  if (clientId) {
    console.log(`[Puppeteer] Cliente encontrado: ID=${clientId}`);
  } else {
    console.log('[Puppeteer] Cliente não encontrado na busca');
  }
  
  return clientId;
}

async function performRenewal(page: Page, clientId: string): Promise<boolean> {
  console.log(`[Puppeteer] Acessando página do cliente ID=${clientId}...`);
  
  // Tenta acessar a página de renovação diretamente
  const renewUrls = [
    `${BASE_URL}/clients/${clientId}/renew`,
    `${BASE_URL}/clients/${clientId}/extend`,
    `${BASE_URL}/clients/${clientId}/duplicate`,
    `${BASE_URL}/clients/${clientId}/edit`,
  ];

  for (const url of renewUrls) {
    try {
      console.log(`[Puppeteer] Tentando: ${url}`);
      const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
      
      if (!response || response.status() === 404) {
        console.log(`[Puppeteer] 404 em ${url}`);
        continue;
      }

      const currentUrl = page.url();
      console.log(`[Puppeteer] Atual URL após navegação: ${currentUrl}`);

      // Busca botão de renovar/confirmar na página
      const renewed = await page.evaluate(() => {
        // Procura botões de submit, renovar, confirmar, etc.
        const buttons = Array.from(document.querySelectorAll(
          'button[type="submit"], input[type="submit"], button, a.btn'
        ));
        const renewBtn = buttons.find(btn => {
          const text = btn.textContent?.toLowerCase() || '';
          return text.includes('renov') || text.includes('confir') || text.includes('salvar') || text.includes('save') || text.includes('extend');
        });
        if (renewBtn) {
          (renewBtn as HTMLElement).click();
          return true;
        }
        return false;
      });

      if (renewed) {
        console.log('[Puppeteer] Botão de renovação clicado!');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
        return true;
      }
    } catch (e: any) {
      console.log(`[Puppeteer] Erro em ${url}: ${e.message}`);
    }
  }

  return false;
}

// Função principal: loga e renova o cliente
export async function renewClientPuppeteer(username: string): Promise<RenewalResult> {
  if (!ADMIN_USER || !ADMIN_PASS) {
    return {
      success: false,
      message: 'STARTPAINEL_ADMIN_USER ou STARTPAINEL_ADMIN_PASS não configurados no .env'
    };
  }

  let browser: Browser | null = null;
  
  try {
    console.log(`\n[Puppeteer] === Iniciando renovação para "${username}" ===`);
    browser = await launchBrowser(true); // headless=true para produção
    const page = await browser.newPage();
    
    // Configura user agent realista
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    // 1. Login
    const loggedIn = await loginToPanel(page);
    if (!loggedIn) {
      const screenshot = await page.screenshot({ encoding: 'base64' }) as string;
      return {
        success: false,
        message: 'Falha no login. Verifique STARTPAINEL_ADMIN_USER e STARTPAINEL_ADMIN_PASS no .env',
        screenshotBase64: screenshot
      };
    }

    // 2. Encontrar ID do cliente
    const clientId = await findClientIdOnPage(page, username);
    if (!clientId) {
      return {
        success: false,
        message: `Cliente "${username}" não encontrado no painel. Verifique o username.`,
      };
    }

    // 3. Renovar
    const renewed = await performRenewal(page, clientId);
    
    const screenshot = await page.screenshot({ encoding: 'base64' }) as string;
    
    if (renewed) {
      return {
        success: true,
        message: `✅ Cliente "${username}" renovado com sucesso! (ID: ${clientId})`,
        clientId,
        screenshotBase64: screenshot
      };
    } else {
      return {
        success: false,
        message: `⚠️ Cliente encontrado (ID: ${clientId}) mas não foi possível localizar o botão de renovação. Verifique o painel manualmente.`,
        clientId,
        screenshotBase64: screenshot
      };
    }

  } catch (error: any) {
    console.error('[Puppeteer] Erro inesperado:', error.message);
    return {
      success: false,
      message: `Erro: ${error.message}`
    };
  } finally {
    if (browser) {
      await browser.close();
      console.log('[Puppeteer] Browser fechado.');
    }
  }
}

// Teste visual (headless=false): abre Chrome visível
export async function renewClientPuppeteerVisible(username: string): Promise<RenewalResult> {
  if (!ADMIN_USER || !ADMIN_PASS) {
    return {
      success: false,
      message: 'STARTPAINEL_ADMIN_USER ou STARTPAINEL_ADMIN_PASS não configurados no .env'
    };
  }

  let browser: Browser | null = null;
  
  try {
    console.log(`\n[Puppeteer VISIBLE] === Abrindo Chrome visível para "${username}" ===`);
    browser = await launchBrowser(false); // headless=false = Chrome visível
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    const loggedIn = await loginToPanel(page);
    if (!loggedIn) {
      return { success: false, message: 'Login falhou' };
    }

    const clientId = await findClientIdOnPage(page, username);
    if (!clientId) {
      return { success: false, message: `Cliente "${username}" não encontrado` };
    }

    const renewed = await performRenewal(page, clientId);
    
    // Aguarda 3 segundos para o usuário ver o resultado
    await new Promise(r => setTimeout(r, 3000));

    return {
      success: renewed,
      clientId,
      message: renewed
        ? `✅ Renovado com sucesso! (ID: ${clientId})`
        : `⚠️ Cliente encontrado mas renovação não confirmada (ID: ${clientId})`
    };
  } catch (error: any) {
    return { success: false, message: error.message };
  } finally {
    if (browser) await browser.close();
  }
}
