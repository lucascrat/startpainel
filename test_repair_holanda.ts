import dotenv from 'dotenv';
dotenv.config();
import { runIBORepairAutomation } from './src/services/ibo-support-service.js';

async function test() {
  const mac = '45:fc:2c:95:41:1f';
  const key = '880073';
  const playlistUrl = 'http://starton.sbs:8880/get.php?username=Holanda2026&password=vuafsr7x&type=m3u_plus&output=m3u8';

  console.log(`🚀 Iniciando teste de reparo IBO para MAC: ${mac}`);
  const result = await runIBORepairAutomation(mac, key, playlistUrl);
  console.log("RESULTADO:", JSON.stringify(result, null, 2));
}

test();
