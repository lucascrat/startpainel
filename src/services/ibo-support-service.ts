
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Page, Browser } from 'puppeteer';
import { launchBrowser, clickButtonByText } from './startpainel-puppeteer';
import path from 'path';

/**
 * SERVIÇO DE SUPORTE AUTOMATIZADO IBO PLAYER
 * Este modulo serve como base para automacoes de alta precisao com Gemini Vision.
 */
export async function runIBOSupportAutomation(mac: string, deviceKey: string, playlistUrl: string) {
  let browser: Browser | null = null;
  const geminiKey = process.env.GEMINI_API_KEY;
  const sites = ['https://iboplayer.com/dashboard', 'https://iboiptv.com/dashboard'];

  try {
    // Launch com as configuracoes stealth ja validadas
    browser = await launchBrowser(false) as any;
    if (!browser) throw new Error('Falha ao iniciar navegador.');
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    let loggedIn = false;

    for (const site of sites) {
      console.log(`[IBO Support] Tentando login em: ${site}`);
      await page.goto(site, { waitUntil: 'networkidle2' });
      await new Promise(r => setTimeout(r, 3000));

      // 1. FRESH CAPTCHA: Sempre atualiza para garantir validade
      console.log('[IBO Support] Atualizando Captcha...');
      await clickButtonByText(page, ['Refresh Captcha', 'Atualizar Captcha']);
      await new Promise(r => setTimeout(r, 2000));

      // 2. MODAL HANDLING: Aceita termos se aparecerem
      const acceptBtn = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, a'));
        return btns.find(b => b.textContent?.toLowerCase().includes('accept')) as HTMLElement;
      });
      if (acceptBtn) await acceptBtn.click();

      // 3. HUMAN TYPING: Preenche MAC e Key com delay humano (200ms) e cliques reais de mouse
      const inputs = await page.$$('input');
      if (inputs.length >= 2) {
        // Preenche MAC
        const macBox = await inputs[0].boundingBox();
        if (macBox) {
          await page.mouse.move(macBox.x + macBox.width / 2, macBox.y + macBox.height / 2);
          await page.mouse.click(macBox.x + macBox.width / 2, macBox.y + macBox.height / 2, { clickCount: 3 });
          await page.keyboard.press('Backspace');
          await page.keyboard.type(mac, { delay: 200 });
        }

        await new Promise(r => setTimeout(r, 1500));

        // Preenche Key
        const keyBox = await inputs[1].boundingBox();
        if (keyBox) {
          await page.mouse.move(keyBox.x + keyBox.width / 2, keyBox.y + keyBox.height / 2);
          await page.mouse.click(keyBox.x + keyBox.width / 2, keyBox.y + keyBox.height / 2, { clickCount: 3 });
          await page.keyboard.press('Backspace');
          await page.keyboard.type(deviceKey, { delay: 200 });
        }
      }

      // 4. GEMINI VISION: Resolve Captcha
      console.log('[IBO Support] Chamando Gemini 2.5 Flash para ler Captcha...');
      const screenshot = await page.screenshot({ encoding: 'base64' });
      const genAI = new GoogleGenerativeAI(geminiKey!);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const prompt = "Retorne apenas o texto (letras/numeros) do captcha presente nesta imagem de login.";
      
      const result = await model.generateContent([
        prompt,
        { inlineData: { data: screenshot as string, mimeType: "image/png" } }
      ]);
      const captchaText = result.response.text().trim().replace(/\s/g, '').toUpperCase();
      console.log(`[IBO Support] Gemini leu: ${captchaText}`);

      // Preenche Captcha e aguarda 5s (Paciencia Humana)
      if (inputs.length >= 3) {
        const captchaBox = await inputs[2].boundingBox();
        if (captchaBox) {
          await page.mouse.move(captchaBox.x + captchaBox.width / 2, captchaBox.y + captchaBox.height / 2);
          await page.mouse.click(captchaBox.x + captchaBox.width / 2, captchaBox.y + captchaBox.height / 2);
          await page.keyboard.type(captchaText, { delay: 200 });
        }
      }

      console.log('[IBO Support] Aguardando 5s para o site validar...');
      await new Promise(r => setTimeout(r, 5000));

      // CLIQUE LOGIN COM MOUSE
      const loginBtn = await page.evaluateHandle(() => {
        const btns = Array.from(document.querySelectorAll('button, a'));
        return btns.find(b => b.textContent?.toUpperCase().includes('LOGIN') || b.textContent?.toUpperCase().includes('ENTRAR'));
      });
      if (loginBtn && loginBtn.asElement()) {
        const lBox = await (loginBtn.asElement() as any).boundingBox();
        if (lBox) {
          await page.mouse.move(lBox.x + lBox.width / 2, lBox.y + lBox.height / 2);
          await page.mouse.click(lBox.x + lBox.width / 2, lBox.y + lBox.height / 2);
        }
      }

      // Verifica sucesso
      try {
        await page.waitForFunction(() => document.body.innerText.includes('Manage Playlists'), { timeout: 15000 });
        loggedIn = true;
        console.log('[IBO Support] Login realizado com sucesso!');
        break;
      } catch (e) {
        console.log(`[IBO Support] Falha no login em ${site}. Tentando proximo...`);
      }
    }

    if (!loggedIn) throw new Error('Nao foi possivel logar nos sites oficiais do IBO.');

    // 5. PLAYLIST UPDATE
    console.log('[IBO Support] Iniciando atualizacao de playlist...');
    await page.goto(page.url().replace('/login', '/dashboard'), { waitUntil: 'networkidle2' });
    
    // Procura o Lapis Azul (Editar)
    const editBtnHandle = await page.evaluateHandle(() => {
      const editBtn = document.querySelector('a[href*="edit"], .fa-edit, .fa-pencil, .blue-text i, i.fa-edit');
      return editBtn;
    });

    if (editBtnHandle && editBtnHandle.asElement()) {
      const box = await (editBtnHandle.asElement() as any).boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }
    } else {
      console.log('[IBO Support] Playlist nao encontrada, tentando Adicionar Nova...');
      await clickButtonByText(page, ['Add Playlist', 'Add XC Playlist']);
    }

    await new Promise(r => setTimeout(r, 3000));

    // PIN 654321
    const pinInp = await page.waitForSelector('input[type="password"], input[placeholder*="PIN"]', { timeout: 5000 }).catch(() => null);
    if (pinInp) {
      await pinInp.type('654321', { delay: 100 });
      await page.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 5000)); // Espera form de edicao
    }

    // URL Playlist
    const urlInp = await page.waitForSelector('input[name*="url"], input[placeholder*="http"]', { timeout: 10000 });
    if (urlInp) {
      await urlInp.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await urlInp.type(playlistUrl, { delay: 50 });
    }

    // Salva
    await clickButtonByText(page, ['SAVE', 'Save', 'Salvar', 'OK', 'Submit']);
    await new Promise(r => setTimeout(r, 5000));

    console.log('[IBO Support] ✅ Fluxo finalizado com sucesso!');
    return { success: true, message: 'Suporte concluido: Playlist IBO atualizada.' };

  } catch (error: any) {
    console.error(`[IBO Support] ERRO FATAL: ${error.message}`);
    return { success: false, message: error.message };
  } finally {
    if (browser) await (browser as any).close();
  }
}
