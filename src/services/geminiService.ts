import { GoogleGenAI, Type } from "@google/genai";
import { db } from "../lib/firebase";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";

export async function chatWithAI(messages: any[], userInfo?: any) {
  let apiKey = process.env.GEMINI_API_KEY;
  let clientPricesContext = "";
  
  // Try to load from Firestore
  try {
    const settingsSnap = await getDoc(doc(db, 'settings', 'global'));
    const dbKey = settingsSnap.data()?.geminiApiKey;
    if (dbKey && dbKey.startsWith('AIza')) {
      apiKey = dbKey;
    }

    // Load client prices for context from Postgres API
    try {
      const response = await fetch('/api/customers');
      if (response.ok) {
        const customersData = await response.json();
        if (customersData.length > 0) {
          clientPricesContext = "\nLista de preços específicos por cliente (se o usuário for um destes, use o valor exato):\n";
          customersData.forEach((c: any) => {
            if (c.username && c.renewal_price) {
              clientPricesContext += `- ${c.username}: R$ ${parseFloat(c.renewal_price).toFixed(2)}\n`;
            }
          });
        }
      }
    } catch (e) {
      console.error("Erro ao buscar preços no Postgres API:", e);
    }
  } catch (e) {
    console.error("Erro ao buscar configurações no banco:", e);
  }

  if (!apiKey || !apiKey.startsWith('AIza')) {
    throw new Error("Configuração da IA Pendente: A chave GEMINI_API_KEY não foi encontrada ou é inválida.");
  }

  // Clean the key
  apiKey = apiKey.trim().replace(/[\u0000-\u001F\u007F-\u009F]/g, "").replace(/^["']|["']$/g, '');

  const ai = new GoogleGenAI({ apiKey });
  
  const generatePixDeclaration = {
    name: 'generate_pix',
    description: 'Gera uma cobrança Pix (QR Code e Copia/Cola) para o cliente efetuar o pagamento. Sempre use essa ferramenta quando o cliente concordar com a renovação e precisar pagar. Não crie o pix sem saber o nome de usuário do cliente.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        username: {
          type: Type.STRING,
          description: 'O nome de usuário do painel StartPainel que será renovado.',
        },
        amount: {
          type: Type.NUMBER,
          description: 'O valor da renovação em reais.',
        },
      },
      required: ['username', 'amount'],
    },
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{
        parts: [{
          text: `Você é um suporte humano atencioso para o sistema StartPainel. 
                 Mantenha o estilo de chat de WhatsApp, sendo breve, usando emojis.
                 O cliente se chama ${userInfo?.name || 'Cliente'}.
                 O objetivo é ajudar ele a renovar o serviço dele no StartPainel.
                 1. Pergunte o nome de usuário dele no painel, caso não saiba.
                 2. Quando ele confirmar o usuário, use a ferramenta "generate_pix" informando o username e o valor de renovação.
                 
                 ${clientPricesContext}
                 
                 Se o usuário não estiver na lista acima, o valor padrão é 49.90.
                 Não invente códigos PIX falsos, use SEMPRE a ferramenta.
                 Histórico: ${JSON.stringify(messages)}`
        }]
      }],
      config: {
        tools: [{ functionDeclarations: [generatePixDeclaration] }]
      }
    });

    return response;
  } catch (error: any) {
    console.error("Gemini Error:", error);
    // Provide a clearer error message for the 403 block if it happens
    if (error.message?.includes('blocked') || error.message?.includes('403')) {
      throw new Error("Erro de Permissão: A API do Gemini retornou 403. Certifique-se de que a 'Generative Language API' está habilitada para sua chave.");
    }
    throw error;
  }
}
