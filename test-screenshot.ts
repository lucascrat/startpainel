import 'dotenv/config';
import { renewClientPuppeteer } from './src/services/startpainel-puppeteer.js';
import fs from 'fs';

async function debug() {
  console.log('Iniciando debug visual...');
  const result = await renewClientPuppeteer('usuario_teste');
  
  if (result.screenshotBase64) {
    fs.writeFileSync('debug-login.png', Buffer.from(result.screenshotBase64, 'base64'));
    console.log('FOTO DO ERRO SALVA EM: debug-login.png');
  }
  
  console.log('Mensagem final:', result.message);
}

debug();
