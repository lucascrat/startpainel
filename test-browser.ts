import { startInteractiveBrowser } from './src/services/startpainel-puppeteer.js';

(async () => {
  console.log('Testing startInteractiveBrowser...');
  const success = await startInteractiveBrowser();
  console.log('Result:', success);
  process.exit(success ? 0 : 1);
})();
