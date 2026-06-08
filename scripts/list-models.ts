// Lista modelos disponíveis na API OpenAI configurada
import dotenv from 'dotenv';
dotenv.config();
import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY || '';
if (!apiKey) {
  console.error('OPENAI_API_KEY não encontrada no .env');
  process.exit(1);
}

const openai = new OpenAI({ apiKey });

async function listModels() {
  try {
    const result = await openai.models.list();
    console.log('\n=== Modelos OpenAI disponíveis ===\n');
    for (const model of result.data.sort((a, b) => a.id.localeCompare(b.id))) {
      console.log(`✅ ${model.id}`);
    }
  } catch (e: any) {
    console.error('Erro:', e.message);
  }
}

listModels();
