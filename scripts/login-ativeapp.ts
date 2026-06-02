import dotenv from 'dotenv';
dotenv.config();
import { initAtiveAppSession } from '../src/services/ativeapp-service.js';

(async () => {
  console.log(`\n=== LOGIN MANUAL ATIVEAPP (via puppeteer) ===`);
  console.log(`O Chrome vai abrir com e-mail/senha preenchidos.`);
  console.log(`Clique em "Entrar", conclua a verificação por telefone se pedir,`);
  console.log(`e aguarde — assim que detectar o login, fecha sozinho e salva a sessão.\n`);

  const result = await initAtiveAppSession();

  console.log(`\n=== RESULTADO ===`);
  console.log(`success: ${result.success}`);
  console.log(`message: ${result.message}\n`);
  process.exit(result.success ? 0 : 1);
})();
