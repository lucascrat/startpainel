
import OpenAI from 'openai';
import { Page, Browser } from 'puppeteer-core';
import { launchBrowser, clickButtonByText } from './startpainel-puppeteer';
import path from 'path';

/**
 * SERVIÇO DE SUPORTE AUTOMATIZADO IBO PLAYER
 * Este modulo serve como base para automacoes de alta precisao com OpenAI Vision.
 */
export async function runIBOSupportAutomation(mac: string, deviceKey: string, playlistUrl: string, profileNum = 0) {
  let browser: Browser | null = null;
  const openaiKey = process.env.OPENAI_API_KEY;
  const sites = ['https://iboplayer.com/dashboard', 'https://iboiptv.com/dashboard'];

  try {
    browser = await launchBrowser(false, profileNum) as any;
    if (!browser) throw new Error('Falha ao iniciar navegador.');
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    let loggedIn = false;

    for (const site of sites) {
      console.log(`[IBO Support] Tentando login em: ${site}`);
      await page.goto(site, { waitUntil: 'networkidle2' });
      await new Promise(r => setTimeout(r, 3000));

      // 1. MODAL HANDLING: Aceita termos se aparecerem
      console.log('[IBO Support] Verificando modal de termos...');
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, a'));
        const btn = btns.find(b => b.textContent?.toLowerCase().includes('accept')) as HTMLElement;
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 2000));

      // 2. FRESH CAPTCHA: Sempre atualiza para garantir validade
      console.log('[IBO Support] Atualizando Captcha...');
      await clickButtonByText(page, ['Refresh Captcha', 'Atualizar Captcha']);
      await new Promise(r => setTimeout(r, 2000));

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

      // 4. OPENAI VISION: Resolve Captcha
      console.log('[IBO Support] Chamando OpenAI Vision para ler Captcha...');
      const screenshot = await page.screenshot({ encoding: 'base64' });
      const openai = new OpenAI({ apiKey: openaiKey! });
      const result = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [{ role: 'user', content: [
          { type: 'text', text: 'Retorne apenas o texto (letras/numeros) do captcha presente nesta imagem de login.' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshot}`, detail: 'low' } },
        ]}],
        max_tokens: 20,
      });
      const captchaText = (result.choices[0]?.message?.content || '').trim().replace(/\s/g, '').toUpperCase();
      console.log(`[IBO Support] OpenAI leu: ${captchaText}`);

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
      const selectors = [
        'svg.text-blue-500',
        'a[href*="edit"]',
        '.fa-edit',
        '.fa-pencil',
        '.blue-text i',
        'i.fa-edit',
        'tbody tr td div svg'
      ];
      for (const s of selectors) {
        const el = document.querySelector(s);
        if (el) return el;
      }
      return null;
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

    // PIN HANDLING
    console.log('[IBO Support] Verificando se pede PIN...');
    const pinInp = await page.waitForSelector('input[id="swal2-input"], input[type="password"], input[placeholder*="PIN"]', { timeout: 6000 }).catch(() => null);
    if (pinInp) {
      console.log('[IBO Support] PIN detectado, preenchendo 654321...');
      await pinInp.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await pinInp.type('654321', { delay: 100 });
      await page.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 5000));
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

/**
 * REPARO AUTOMATIZADO IBO PLAYER (COM CHECK DE EXPIRAÇÃO)
 * Esta função verifica se o MAC está vencido no site antes de atualizar a lista.
 */
export async function runIBORepairAutomation(mac: string, deviceKey: string, playlistUrl: string, profileNum = 0) {
  let browser: Browser | null = null;
  const openaiKey = process.env.OPENAI_API_KEY;
  const sites = ['https://iboplayer.com/dashboard', 'https://iboiptv.com/dashboard'];

  try {
    browser = await launchBrowser(false, profileNum) as any;
    if (!browser) throw new Error('Falha ao iniciar navegador.');
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    let loggedIn = false;

    for (const site of sites) {
      console.log(`[IBO Repair] Tentando login em: ${site}`);
      await page.goto(site, { waitUntil: 'networkidle2' });
      await new Promise(r => setTimeout(r, 3000));

      // 1. MODAL HANDLING
      console.log('[IBO Repair] Verificando modal de termos...');
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, a'));
        const btn = btns.find(b => b.textContent?.toLowerCase().includes('accept')) as HTMLElement;
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 2000));

      // 2. FRESH CAPTCHA
      console.log('[IBO Repair] Atualizando Captcha...');
      await clickButtonByText(page, ['Refresh Captcha', 'Atualizar Captcha']);
      await new Promise(r => setTimeout(r, 2000));

      // 3. HUMAN TYPING (MAC/Key)
      const inputs = await page.$$('input');
      if (inputs.length >= 2) {
        // MAC
        const macBox = await inputs[0].boundingBox();
        if (macBox) {
          await page.mouse.move(macBox.x + macBox.width / 2, macBox.y + macBox.height / 2);
          await page.mouse.click(macBox.x + macBox.width / 2, macBox.y + macBox.height / 2, { clickCount: 3 });
          await page.keyboard.press('Backspace');
          await page.keyboard.type(mac, { delay: 150 });
        }
        await new Promise(r => setTimeout(r, 800));
        // Key
        const keyBox = await inputs[1].boundingBox();
        if (keyBox) {
          await page.mouse.move(keyBox.x + keyBox.width / 2, keyBox.y + keyBox.height / 2);
          await page.mouse.click(keyBox.x + keyBox.width / 2, keyBox.y + keyBox.height / 2, { clickCount: 3 });
          await page.keyboard.press('Backspace');
          await page.keyboard.type(deviceKey, { delay: 150 });
        }
      }

      // 4. OPENAI VISION (Captcha)
      console.log(`[IBO Repair] Tirando print do captcha...`);
      const screenshot = await page.screenshot({ encoding: 'base64' });
      const openai = new OpenAI({ apiKey: openaiKey! });

      try {
        const result = await openai.chat.completions.create({
          model: 'gpt-4.1-mini',
          messages: [{ role: 'user', content: [
            { type: 'text', text: 'Retorne apenas o texto do captcha desta imagem de login. Retorne apenas o codigo.' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshot}`, detail: 'low' } },
          ]}],
          max_tokens: 20,
        });
        const captchaText = (result.choices[0]?.message?.content || '').trim().replace(/\s/g, '').toUpperCase();
        console.log(`[IBO Repair] OpenAI leu captcha: "${captchaText}"`);

        if (inputs.length >= 3) {
          const captchaBox = await inputs[2].boundingBox();
          if (captchaBox) {
            await page.mouse.move(captchaBox.x + captchaBox.width / 2, captchaBox.y + captchaBox.height / 2);
            await page.mouse.click(captchaBox.x + captchaBox.width / 2, captchaBox.y + captchaBox.height / 2);
            await page.keyboard.type(captchaText, { delay: 100 });
          }
        }
      } catch (openaiErr: any) {
        console.error(`[IBO Repair] Erro no OpenAI: ${openaiErr.message}`);
      }

      await new Promise(r => setTimeout(r, 3000));
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

      try {
        await page.waitForFunction(() => document.body.innerText.includes('Manage Playlists'), { timeout: 15000 });
        loggedIn = true;
        break;
      } catch (e) {
        console.log(`[IBO Repair] Falha no login em ${site}. Tirando print de erro...`);
        await page.screenshot({ path: `scratch/error_login_${site.replace(/[:/]/g, '_')}.png` });
      }
    }

    if (!loggedIn) throw new Error('Nao foi possivel logar nos sites oficiais do IBO.');

    // 5. CHECK EXPIRATION
    console.log('[IBO Repair] Verificando validade do app...');
    const expirationData = await page.evaluate(() => {
      const text = document.body.innerText;
      const isExpired = text.includes('Expired') || text.includes('Vencido') || text.includes('Vencida');
      const dateRegex = /(\d{2}[/-]\d{2}[/-]\d{4})|(\d{4}[/-]\d{2}[/-]\d{2})/;
      const match = text.match(dateRegex);
      return { isExpired, date: match ? match[0] : 'desconhecida' };
    });

    if (expirationData.isExpired) {
      console.log(`[IBO Repair] 🚨 App EXPIRADO em ${expirationData.date}`);
      return { 
        success: true, 
        status: 'expired', 
        expiryDate: expirationData.date, 
        message: `O aplicativo IBO está VENCIDO (venceu em ${expirationData.date}). É necessário renovar a licença do app para voltar a funcionar.` 
      };
    }

    // 6. PLAYLIST UPDATE (If Active)
    console.log('[IBO Repair] App ativo. Atualizando playlist...');
    await page.goto(page.url().replace('/login', '/dashboard'), { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // RECURRING MODAL HANDLING (Sometimes it appears after login)
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      const btn = btns.find(b => b.textContent?.toLowerCase().includes('accept')) as HTMLElement;
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 2000));
    
    const editBtnHandle = await page.evaluateHandle(() => {
      const selectors = [
        'svg.text-blue-500',
        'a[href*="edit"]',
        '.fa-edit',
        '.fa-pencil',
        '.blue-text i',
        'i.fa-edit',
        'tbody tr td div svg'
      ];
      for (const s of selectors) {
        const el = document.querySelector(s);
        if (el) return el;
      }
      return null;
    });

    if (editBtnHandle && editBtnHandle.asElement()) {
      const box = await (editBtnHandle.asElement() as any).boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }
    } else {
      await clickButtonByText(page, ['Add Playlist', 'Add XC Playlist']);
    }

    await new Promise(r => setTimeout(r, 3000));

    // PIN HANDLING
    console.log('[IBO Repair] Verificando se pede PIN...');
    const pinInp = await page.waitForSelector('input[id="swal2-input"], input[type="password"], input[placeholder*="PIN"]', { timeout: 6000 }).catch(() => null);
    if (pinInp) {
      console.log('[IBO Repair] PIN detectado, preenchendo 654321...');
      await pinInp.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await pinInp.type('654321', { delay: 100 });
      await page.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 5000));
    }

    // URL Playlist
    console.log('[IBO Repair] Localizando campo de URL...');
    let urlInp = await page.waitForSelector('input[name*="url"], input[placeholder*="http"]', { timeout: 10000 }).catch(() => null);
    
    if (!urlInp) {
       console.log('[IBO Repair] Selector padrao falhou. Tentando via evaluate...');
       const coords = await page.evaluate(() => {
         const inp = Array.from(document.querySelectorAll('input')).find(i => {
           const p = (i.placeholder || '').toLowerCase();
           const n = (i.name || '').toLowerCase();
           return p.includes('url') || p.includes('http') || n.includes('url') || n.includes('m3u');
         });
         if (!inp) return null;
         const r = inp.getBoundingClientRect();
         return { x: r.x + r.width/2, y: r.y + r.height/2 };
       });
       if (coords) {
         await page.mouse.click(coords.x, coords.y);
         urlInp = (await page.$('input:focus')) as any;
       }
    }

    if (urlInp) {
      await urlInp.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await urlInp.type(playlistUrl, { delay: 30 });
    } else {
       console.log('[IBO Repair] ❌ Campo de URL nao encontrado. Tirando print final...');
       await page.screenshot({ path: 'scratch/error_playlist_update.png' });
       throw new Error('Campo de URL da playlist nao localizado no site.');
    }

    // Salva
    await clickButtonByText(page, ['SAVE', 'Save', 'Salvar', 'OK', 'Submit']);
    await new Promise(r => setTimeout(r, 5000));

    console.log('[IBO Repair] ✅ Playlist atualizada com sucesso!');
    return { 
      success: true, 
      status: 'updated', 
      expiryDate: expirationData.date, 
      message: 'Lista atualizada com sucesso no site do IBO Player. O sinal deve voltar em instantes.' 
    };

  } catch (error: any) {
    console.error(`[IBO Repair] ERRO: ${error.message}`);
    return { success: false, message: error.message };
  } finally {
    if (browser) await (browser as any).close();
  }
}

