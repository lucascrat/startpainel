import { createTestClientAndActivatePlayer } from './src/services/startpainel-puppeteer.js';

async function run() {
  const mac = '1J616k';
  const playerName = 'X-Cloud';
  const username = 'xcloudtest' + Math.floor(Math.random() * 10000);
  
  console.log(`Iniciando teste manual...`);
  console.log(`MAC: ${mac} | App: ${playerName} | Username: ${username}`);
  
  try {
    const result = await createTestClientAndActivatePlayer(username, mac, playerName, 0);
    console.log("=== Resultado da Execução ===");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Erro fatal:", error);
  }
  process.exit(0);
}

run();
