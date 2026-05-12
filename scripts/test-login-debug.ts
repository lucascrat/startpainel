import dotenv from 'dotenv';
dotenv.config();
import { renewClientPuppeteer } from './src/services/startpainel-puppeteer.js';

async function test() {
  console.log('--- TESTE DE CONEXÃO STARTPAINEL ---');
  console.log('URL:', process.env.STARTPAINEL_URL);
  console.log('User:', process.env.STARTPAINEL_ADMIN_USER);
  
  // Vamos tentar renovar um usuário de teste (ou apenas logar)
  // Vou usar um nome fictício só para testar o fluxo de login
  const result = await renewClientPuppeteer('usuario_teste_conexao');
  
  console.log('\n--- RESULTADO ---');
  console.log('Sucesso:', result.success);
  console.log('Mensagem:', result.message);
  
  if (result.screenshotBase64) {
    console.log('Screenshot capturada (login falhou ou terminou).');
  }
}

test();
