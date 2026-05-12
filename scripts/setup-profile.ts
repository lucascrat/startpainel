import 'dotenv/config';
import { renewClientPuppeteerVisible } from './src/services/startpainel-puppeteer.js';

async function setup() {
  console.log('--- CONFIGURAÇÃO DE PERFIL HUMANO ---');
  console.log('Vou abrir o Chrome agora. Por favor:');
  console.log('1. Faça o login manualmente se o site pedir.');
  console.log('2. Resolva qualquer desafio (Captcha) que aparecer.');
  console.log('3. Quando estiver dentro do painel, pode fechar o Chrome.');
  
  await renewClientPuppeteerVisible('teste');
  console.log('Configuração finalizada!');
}

setup();
