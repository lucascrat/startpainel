import dotenv from 'dotenv';
dotenv.config();
import { launchBrowser } from './src/services/startpainel-puppeteer.js';
import OpenAI from 'openai';

async function debug() {
  const mac = '45:fc:2c:95:41:1f';
  const key = '880073';
  const site = 'https://iboplayer.com/device/login';
  const openaiKey = process.env.OPENAI_API_KEY;

  const browser = await launchBrowser(false) as any;
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  await page.goto(site, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 4000));

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, a'));
    const btn = btns.find(b => b.textContent?.toLowerCase().includes('accept')) as HTMLElement;
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  const inputs = await page.$$('input');
  await inputs[0].type(mac, { delay: 50 });
  await inputs[1].type(key, { delay: 50 });

  const screenshot = await page.screenshot({ encoding: 'base64' });
  const openai = new OpenAI({ apiKey: openaiKey! });
  const result = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [{ role: 'user', content: [
      { type: 'text', text: 'Retorne apenas o texto do captcha desta imagem. Retorne apenas o codigo.' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshot}`, detail: 'low' } },
    ]}],
    max_tokens: 20,
  });
  const captchaText = (result.choices[0]?.message?.content || '').trim().replace(/\s/g, '').toUpperCase();
  console.log(`[Debug] Captcha: ${captchaText}`);
  await inputs[2].type(captchaText);
  await page.keyboard.press('Enter');

  await new Promise(r => setTimeout(r, 6000));

  console.log("[Debug] Localizando Edit (SVG azul) via coordenadas...");
  const editBox = await page.evaluate(() => {
    const svg = document.querySelector('svg.text-blue-500');
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    return { x: r.x + r.width/2, y: r.y + r.height/2 };
  });

  if (editBox) {
    console.log(`[Debug] Clicando em ${editBox.x}, ${editBox.y}`);
    await page.mouse.click(editBox.x, editBox.y);
  } else {
    console.log("[Debug] SVG nao encontrado!");
  }

  await new Promise(r => setTimeout(r, 5000));

  console.log("[Debug] Tirando print do Modal de Edição...");
  await page.screenshot({ path: 'scratch/edit_modal_debug_2.png' });

  const html = await page.evaluate(() => document.body.innerHTML);
  const fs = await import('fs');
  fs.writeFileSync('scratch/edit_modal_debug_2.html', html);

  await browser.close();
}

debug();
