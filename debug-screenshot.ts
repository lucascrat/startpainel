import 'dotenv/config';
import { launchBrowser, loginToPanel } from './src/services/startpainel-puppeteer.js';

async function run() {
  const BASE_URL = process.env.STARTPAINEL_URL || 'https://cms.startpainel.cc';
  console.log("Iniciando debug de inputs em:", BASE_URL);
  
  const browser = await launchBrowser(false, 0);
  const page = await browser.newPage();
  
  try {
    const loggedIn = await loginToPanel(page);
    console.log("Logged In Result:", loggedIn);
    
    const targetUrl = `${BASE_URL}/clients/new`;
    console.log("Acessando", targetUrl, "...");
    await page.goto(targetUrl, { waitUntil: 'networkidle2' });
    
    await new Promise(r => setTimeout(r, 5000));
    
    console.log("URL final:", page.url());
    
    const inputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input')).map(i => ({
        id: i.id,
        name: i.name,
        type: i.type,
        placeholder: i.placeholder,
        outerHTML: i.outerHTML
      }));
    });
    
    console.log("Inputs encontrados na pagina:");
    console.log(JSON.stringify(inputs, null, 2));
    
    await page.screenshot({ path: 'd:\\startpainel\\startpainel\\debug-screen.png', fullPage: true });
    console.log("Screenshot salvo em debug-screen.png");
  } catch(e) {
    console.error("Erro no debug:", e);
  } finally {
    await browser.close();
  }
}

run();
