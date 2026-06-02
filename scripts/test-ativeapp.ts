import dotenv from 'dotenv';
dotenv.config();
import { runAtiveAppActivation } from '../src/services/ativeapp-service.js';

const appName = process.argv[2] || 'IBO Pro';
const mac     = process.argv[3] || 'db:71:b5:c5:92:6d';

(async () => {
  console.log(`\n=== TESTE ATIVEAPP ===`);
  console.log(`App: ${appName}`);
  console.log(`MAC: ${mac}\n`);

  const result = await runAtiveAppActivation(appName, mac, 98);

  console.log(`\n=== RESULTADO ===`);
  console.log(`success: ${result.success}`);
  console.log(`message: ${result.message}\n`);
  process.exit(result.success ? 0 : 1);
})();
