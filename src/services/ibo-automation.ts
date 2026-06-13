import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer-core';
import os from 'os';
import path from 'path';
import OpenAI from "openai";

puppeteer.use(StealthPlugin());

const isWindows = os.platform() === 'win32';
const DEFAULT_CHROME_PATH = isWindows 
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : '/usr/bin/chromium';

const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || DEFAULT_CHROME_PATH;

async function launchBrowser(headless = false): Promise<Browser> {
  const userDataDir = path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'AutomationProfile');
  return puppeteer.launch({
    executablePath: CHROME_PATH,
    headless,
    userDataDir,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1280,900',
      '--start-maximized'
    ],
    defaultViewport: null,
  }) as unknown as Browser;
}

export async function runIboPlayerAutomation(mac: string, key: string, playlistUrl: string, openaiKey?: string, targetUrl?: string) {
  let browser: Browser | null = null;
  let aiUsage: any = null;
  try {
    browser = await launchBrowser(false); // Visible for monitoring
    const page = await browser.newPage();
    
    let loginUrl = targetUrl || 'https://iboplayer.com/device/login';
    // Se for apenas o domínio, adiciona o path de login
    if (!loginUrl.includes('/device/login')) {
       loginUrl = loginUrl.replace(/\/$/, '') + '/device/login';
    }

    console.log(`[Automation] Acessando ${loginUrl}...`);
    await page.goto(loginUrl, { waitUntil: 'networkidle2' });

    // Accept legal terms if present
    try {
      await page.waitForSelector('button', { timeout: 5000 });
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text?.toLowerCase().includes('accept') || text?.toLowerCase().includes('concordar')) {
          await btn.click();
          console.log('[Automation] Termos aceitos.');
          break;
        }
      }
    } catch (e) {}

    // Fill MAC and Key
    console.log('[Automation] Preenchendo dados de login...');
    await page.waitForSelector('input[name="mac_address"], #mac_address', { timeout: 10000 });
    await page.type('input[name="mac_address"], #mac_address', mac, { delay: 100 });
    await page.type('input[name="device_key"], #device_key', key, { delay: 100 });

    // Solve Captcha with OpenAI Vision if Key is available
    if (openaiKey) {
      console.log('[Automation] Tentando resolver Captcha com IA (OpenAI)...');
      try {
        const captchaSelector = 'img[src*="captcha"], .captcha-img, #captcha_img';
        const captchaElement = await page.waitForSelector(captchaSelector, { timeout: 5000 });

        if (captchaElement) {
          const screenshot = await captchaElement.screenshot({ encoding: 'base64' });
          const openai = new OpenAI({ apiKey: openaiKey });
          const result = await openai.chat.completions.create({
            model: 'gpt-4.1-mini',
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: 'What is the text shown in this captcha image? Respond only with the characters found, nothing else.' },
                { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshot}`, detail: 'low' } },
              ],
            }],
            max_tokens: 20,
          });

          aiUsage = {
            promptTokens: result.usage?.prompt_tokens || 0,
            candidatesTokens: result.usage?.completion_tokens || 0,
            model: 'gpt-4.1-mini'
          };

          const captchaText = (result.choices[0]?.message?.content || '').trim().replace(/\s/g, '');
          console.log('[Automation] IA identificou:', captchaText);
          const captchaInputSelector = 'input[name="captcha"], #captcha, input[placeholder*="Captcha"]';
          await page.type(captchaInputSelector, captchaText, { delay: 100 });
          await page.evaluate(() => window.scrollTo(0, 800));
          const loginBtn = 'button[type="submit"], #login_btn, .btn-primary';
          await page.click(loginBtn);
        }
      } catch (err: any) {
        console.log('[Automation] Falha ao resolver com IA, aguardando manual...');
      }
    } else {
      await page.evaluate(() => window.scrollTo(0, 800));
      console.log('[Automation] Aguardando preenchimento manual do captcha e login...');
    }

    // Wait for the dashboard to load after login
    await page.waitForNavigation({ timeout: 300000 }); 
    console.log('[Automation] Login realizado! Iniciando configuração da lista...');

    // 1. Navigate to Manage Playlists (should be default, but let's be sure)
    await page.waitForSelector('button, a', { timeout: 10000 });
    const menuItems = await page.$$('button, a, .nav-link');
    for (const item of menuItems) {
      const text = await page.evaluate(el => el.textContent, item);
      if (text?.toLowerCase().includes('manage playlist')) {
        await item.click();
        break;
      }
    }

    // 2. Click "Add Playlist"
    console.log('[Automation] Clicando em Add Playlist...');
    await page.waitForSelector('button', { timeout: 10000 });
    const addButtons = await page.$$('button');
    for (const btn of addButtons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text?.toLowerCase().trim() === 'add playlist') {
        await btn.click();
        break;
      }
    }

    // 3. Fill Playlist Details
    console.log('[Automation] Preenchendo dados da lista IBOTV...');
    await page.waitForSelector('input[name="playlist_name"], #playlist_name', { timeout: 10000 });
    await page.type('input[name="playlist_name"], #playlist_name', 'IBOTV', { delay: 50 });
    await page.type('input[name="playlist_url"], #playlist_url', playlistUrl, { delay: 20 });

    // 4. Protect Playlist
    console.log('[Automation] Ativando proteção por PIN...');
    const protectCheckbox = 'input[type="checkbox"], #protect_playlist';
    await page.click(protectCheckbox);
    
    // 5. Fill PIN
    await page.waitForSelector('input[name="pin"], #pin', { timeout: 5000 });
    await page.type('input[name="pin"], #pin', '161917', { delay: 50 });
    await page.type('input[name="confirm_pin"], #confirm_pin', '161917', { delay: 50 });

    // 6. Save
    console.log('[Automation] Salvando...');
    const saveBtn = 'button:contains("SAVE"), .btn-save, #save_btn';
    const allButtons = await page.$$('button');
    for (const btn of allButtons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text?.toUpperCase().includes('SAVE')) {
        await btn.click();
        break;
      }
    }

    await new Promise(r => setTimeout(r, 3000));
    console.log('[Automation] Fluxo completo com sucesso!');
    return { success: true, message: 'Automação concluída: Login e Lista configurada!', aiUsage };

  } catch (error: any) {
    console.error('[Automation] Erro:', error.message);
    return { success: false, message: error.message, aiUsage };
  }
}
