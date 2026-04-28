// Lista modelos disponíveis na API Key configurada
import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY || '';
if (!apiKey) {
  console.error('GEMINI_API_KEY não encontrada no .env');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

async function listModels() {
  try {
    const result = await ai.models.list();
    console.log('\n=== Modelos disponíveis ===\n');
    for await (const model of result) {
      const supported = (model as any).supportedGenerationMethods || [];
      if (supported.includes('generateContent')) {
        console.log(`✅ ${model.name}  →  ${model.displayName}`);
      }
    }
  } catch (e: any) {
    console.error('Erro:', e.message);
  }
}

listModels();
