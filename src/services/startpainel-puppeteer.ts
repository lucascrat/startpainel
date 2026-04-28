import { Browser, Page } from 'puppeteer-core';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import os from 'os';

// Configura o plugin stealth
puppeteer.use(StealthPlugin());

// Detect OS and set default Chrome path
const isWindows = os.platform() === 'win32';
const DEFAULT_CHROME_PATH = isWindows 
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : '/usr/bin/chromium';

const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || DEFAULT_CHROME_PATH;
const BASE_URL = (process.env.STARTPAINEL_URL || 'https://cms.startpainel.cc').replace(/\/$/, '');
const ADMIN_USER = process.env.STARTPAINEL_ADMIN_USER || '';
const ADMIN_PASS = process.env.STARTPAINEL_ADMIN_PASS || '';

export interface RenewalResult {
  success: boolean;
  message: string;
  clientId?: string;
  screenshotBase64?: string;
}

async function launchBrowser(headless = true): Promise<Browser> {
  console.log(`[Puppeteer Stealth] Launching with: ${CHROME_PATH}`);
  return puppeteer.launch({
    executablePath: CHROME_PATH,
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,900',
      '--disable-infobars',
      '--window-position=0,0',
      '--ignore-certifcate-errors',
      '--ignore-certifcate-errors-spki-list',
    ],
    defaultViewport: { width: 1280, height: 900 },
  }) as unknown as Browser;
}

async function loginToPanel(page: Page): Promise<boolean> {
  const loginUrl = `${BASE_URL.replace(/\/$/, '')}/login`;
  console.log(`[Puppeteer] Tentando acessar: ${loginUrl}`);
  
  // Configura headers extremamente realistas para evitar o redirecionamento M3U.app
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
  });

  // Remove vestígios de automação via JavaScript injetado
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  // Aguarda um tempo aleatório antes de navegar (parecer humano)
  await new Promise(r => setTimeout(r, Math.random() * 3000 + 1000));

  try {
    await page.goto(loginUrl, { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });
  } catch (e: any) {
    console.error(`[Puppeteer] Erro no carregamento: ${e.message}`);
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  }

  const title = await page.title();
  console.log(`[Puppeteer] Título da página: ${title}`);

  // Verifica se caímos em algum bloqueio
  const content = await page.content();
  if (content.includes('Cloudflare') || content.includes('Verify you are human')) {
    console.error('[Puppeteer] Possível bloqueio detectado (Cloudflare/Human verification).');
  }

  console.log('[Puppeteer] Aguardando campos de login...');
  // Seletores baseados na inspeção real
  const userSelector = 'input#username';
  const passSelector = 'input#password';
  const loginBtnSelector = 'button#loginbtn, button[type="submit"], .btn-primary';

  try {
    await page.waitForSelector(userSelector, { timeout: 20000 });
  } catch (e) {
    console.error(`[Puppeteer] Seletor "${userSelector}" não encontrado.`);
    const inputs = await page.$$eval('input', el => el.map(i => ({ id: i.id, name: i.name, type: i.type })));
    console.log('[Puppeteer] Inputs na página:', JSON.stringify(inputs));
    throw new Error(`Campo de login não apareceu. Título: ${title}`);
  }

  console.log('[Puppeteer] Preenchendo credenciais...');
  // Simula movimentos humanos de mouse antes de digitar
  await page.mouse.move(100, 100);
  await page.mouse.move(200, 300, { steps: 10 });
  
  await page.click(userSelector, { clickCount: 3 });
  await page.type(userSelector, ADMIN_USER, { delay: Math.floor(Math.random() * 100) + 50 });
  
  await page.mouse.move(300, 400, { steps: 5 });
  await page.click(passSelector, { clickCount: 3 });
  await page.type(passSelector, ADMIN_PASS, { delay: Math.floor(Math.random() * 100) + 50 });

  console.log('[Puppeteer] Clicando em Entrar...');
  // Move o mouse até o botão antes de clicar
  const btn = await page.$(loginBtnSelector);
  if (btn) {
    const box = await btn.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
    }
  }

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
    page.click(loginBtnSelector).catch(() => page.keyboard.press('Enter'))
  ]);

  const currentUrl = page.url();
  console.log(`[Puppeteer] Pós-login URL: ${currentUrl}`);
  
  const isLoggedIn = !currentUrl.includes('/login');
  if (!isLoggedIn) {
    const errMsg = await page.$eval(
      '.alert-danger, .alert.alert-error, [class*="error"]',
      (el) => el.textContent?.trim() || ''
    ).catch(() => '');
    console.error(`[Puppeteer] Login falhou. Erro no painel: ${errMsg}`);
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
