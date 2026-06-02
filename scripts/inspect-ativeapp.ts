import dotenv from 'dotenv';
dotenv.config();
import { launchBrowser } from '../src/services/startpainel-puppeteer.js';

const EMAIL = process.env.ATIVEAPP_EMAIL || '';
const PASS  = process.env.ATIVEAPP_PASSWORD || '';
const ACTIV = 'https://www.ativeapp.com/reseller/activations';

(async () => {
  const browser: any = await launchBrowser(false, 98);
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  await page.goto(ACTIV, { waitUntil: 'networkidle2', timeout: 30_000 });
  await new Promise(r => setTimeout(r, 4000));

  // login se necessário — usando Ctrl+A para limpar campos antes de digitar
  if (page.url().includes('/auth') || page.url().includes('/login')) {
    console.log('[inspect] Fazendo login...');
    await page.waitForSelector('input[type="email"]', { visible: true, timeout: 10_000 });

    await page.click('input[type="email"]');
    await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
    await page.type('input[type="email"]', EMAIL, { delay: 50 });

    await page.click('input[type="password"]');
    await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
    await page.type('input[type="password"]', PASS, { delay: 50 });

    await page.evaluate(() => {
      const cb = document.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      if (cb && !cb.checked) cb.click();
      const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent||'').toLowerCase().includes('entrar'));
      (btn as HTMLElement)?.click();
    });

    // poll até logar (até 25s)
    const dl = Date.now() + 25_000;
    while (Date.now() < dl) {
      await new Promise(r => setTimeout(r, 2000));
      if (!page.url().includes('/auth') && !page.url().includes('/login')) break;
    }
    console.log('[inspect] URL após login:', page.url());
    if (!page.url().includes('/activations')) {
      await page.goto(ACTIV, { waitUntil: 'networkidle2', timeout: 30_000 });
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // abre "Nova ativação"
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button, a')).find(b => (b.textContent||'').toLowerCase().includes('nova ativa'));
    (btn as HTMLElement)?.click();
  });
  await new Promise(r => setTimeout(r, 2500));

  // dump dos selects, inputs e botões do modal
  const info = await page.evaluate(() => {
    const out: any = { selects: [], inputs: [], buttons: [], comboboxes: [] };
    document.querySelectorAll('select').forEach((s: any) => {
      out.selects.push({
        name: s.name, id: s.id, className: s.className,
        options: Array.from(s.options).slice(0, 12).map((o: any) => ({ text: o.text, value: o.value })),
      });
    });
    document.querySelectorAll('input').forEach((i: any) => {
      out.inputs.push({ type: i.type, name: i.name, id: i.id, placeholder: i.placeholder, className: i.className });
    });
    document.querySelectorAll('button').forEach((b: any) => {
      out.buttons.push({ text: (b.textContent||'').trim().slice(0,40), className: b.className, disabled: b.disabled });
    });
    document.querySelectorAll('[role="combobox"],[role="listbox"],[class*="select"],[class*="combo"]').forEach((c: any) => {
      out.comboboxes.push({ tag: c.tagName, role: c.getAttribute('role'), className: c.className, text: (c.textContent||'').trim().slice(0,40) });
    });
    return out;
  });

  console.log('\n===== MODAL DOM =====');
  console.log(JSON.stringify(info, null, 2));

  await page.screenshot({ path: 'D:/startpainel/startpainel/debug-ativeapp-modal.png' }).catch(() => {});
  console.log('\nScreenshot: debug-ativeapp-modal.png');
  console.log('Deixando o browser aberto 8s pra inspecao...');
  await new Promise(r => setTimeout(r, 8000));
  await browser.close();
  process.exit(0);
})();
