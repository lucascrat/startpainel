import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';
import jwt from 'jsonwebtoken';
import Gerencianet from 'gn-api-sdk-node';
import pkg from 'pg';
const { Pool } = pkg;
import { GoogleGenerativeAI } from "@google/generative-ai";
import { renewClientPuppeteer, createClientAndGetPlaylist, activateUltraPlayer } from './src/services/startpainel-puppeteer.js';
import { runIboPlayerAutomation } from './src/services/ibo-automation.js';
import { EvolutionService } from './src/services/evolution-api.js';
import multer from 'multer';
import { EdgeTTS } from '@andresaya/edge-tts';

// Initialize Postgres Pool
const DB_URL = process.env.DATABASE_URL || 'postgres://postgres:EUUQna43FyrX3Vr74SYTihqqTkvQhMr630clCNtuJlfgeiS4I5lSkFUq7achOqsv@187.77.230.251:5436/postgres';

console.log('PG: Checking database connection...');
const pool = new Pool({
  connectionString: DB_URL,
  ssl: false,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
  console.error('PG: Unexpected error on idle client', err);
});

let dbStatus = 'connecting';
let dbError = '';

async function initDB() {
  let client;
  try {
    client = await pool.connect();
    console.log('PG: Successfully connected to PostgreSQL server');
    
    const queries = [
      `CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        text TEXT NOT NULL,
        sender VARCHAR(20) NOT NULL,
        type VARCHAR(50) DEFAULT 'text',
        remote_jid TEXT,
        contact_name TEXT,
        metadata JSONB,
        image_data TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        remote_jid TEXT UNIQUE NOT NULL,
        name TEXT,
        profile_pic TEXT,
        last_message TEXT,
        last_message_time TIMESTAMP,
        unread_count INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        name TEXT,
        whatsapp TEXT,
        renewal_price DECIMAL(10,2) DEFAULT 49.90,
        cost_per_credit DECIMAL(10,2) DEFAULT 0.00,
        amount_paid DECIMAL(10,2) DEFAULT 0.00,
        lines_count INTEGER DEFAULT 1,
        status TEXT DEFAULT 'active',
        expiration_date DATE,
        playlist_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS automations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        site_url TEXT NOT NULL,
        username TEXT,
        password TEXT,
        type TEXT DEFAULT 'generic',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS ai_usage_logs (
        id SERIAL PRIMARY KEY,
        model TEXT NOT NULL,
        type TEXT NOT NULL,
        prompt_tokens INTEGER,
        candidates_tokens INTEGER,
        estimated_cost DECIMAL(15,8),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS customer_apps (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
        app_name TEXT NOT NULL,
        app_model TEXT,
        access_type TEXT,
        mac_address TEXT,
        device_key TEXT,
        username TEXT,
        password TEXT,
        provider_url TEXT,
        android_link TEXT,
        ios_link TEXT,
        icon_url TEXT,
        app_site_url TEXT,
        is_tv BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS pix_charges (
        txid TEXT PRIMARY KEY,
        customer_username TEXT,
        amount DECIMAL(10,2) NOT NULL,
        status TEXT DEFAULT 'ATIVA',
        processed BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const q of queries) {
      await client.query(q);
    }

    const migrations = [
      'ALTER TABLE customers ADD COLUMN IF NOT EXISTS name TEXT',
      'ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp TEXT',
      'ALTER TABLE customers ADD COLUMN IF NOT EXISTS renewal_price DECIMAL(10,2) DEFAULT 49.90',
      'ALTER TABLE customers ADD COLUMN IF NOT EXISTS cost_per_credit DECIMAL(10,2) DEFAULT 0.00',
      'ALTER TABLE customers ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(10,2) DEFAULT 0.00',
      'ALTER TABLE customers ADD COLUMN IF NOT EXISTS lines_count INTEGER DEFAULT 1',
      'ALTER TABLE customers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT \'active\'',
      'ALTER TABLE customers ADD COLUMN IF NOT EXISTS expiration_date DATE',
      'ALTER TABLE customers ADD COLUMN IF NOT EXISTS playlist_url TEXT',
      'ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      'ALTER TABLE ai_usage_logs ALTER COLUMN estimated_cost TYPE DECIMAL(15,8)'
    ];

    for (const m of migrations) {
      try {
        await client.query(m);
      } catch (err) {
        // Migration might already exist
      }
    }

    dbStatus = 'connected';
  } catch (err: any) {
    console.error('PG: Initialization error', err);
    dbStatus = 'error';
    dbError = err.message;
  } finally {
    if (client) client.release();
  }
}

initDB();

const app = express();
app.use(express.json({ limit: '50mb' }));
const PORT = process.env.PORT || 3000;

// Multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// --- AI HELPERS ---
async function handleAIChat(remoteJid: string, history: any[], userInfo: any, media?: { data: string, mimeType: string }) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not defined");

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Check custom system prompt
    const promptRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['ai_system_prompt']);
    
    // Fetch customer prices context
    const priceRes = await pool.query('SELECT username, renewal_price FROM customers');
    const clientPricesContext = priceRes.rows.map(r => `${r.username}: R$ ${r.renewal_price}`).join(', ');

    let systemPrompt = '';
    if (promptRes.rows.length > 0 && promptRes.rows[0].value) {
      systemPrompt = promptRes.rows[0].value;
      systemPrompt = systemPrompt.replace(/{{clientPricesContext}}/g, clientPricesContext || '')
                                 .replace(/{{userInfo.name}}/g, userInfo?.name || 'Cliente');
    } else {
      systemPrompt = `Você é um assistente multi-modal para o StartPainel.
                  
                  Regras de Atuação:
                  1. SUPORTE STARTPAINEL: Se o usuário quiser renovar ou tiver dúvidas do painel, aja como suporte humano, breve, estilo WhatsApp.
                     - Pergunte o username se não souber.
                     - Use "generate_pix" para cobranças.
                     - Use "get_customer_info" para consultar dados.
                     - Contexto de Preços: ${clientPricesContext}
                     - Preço padrão: 49.90.
                  
                  2. EXTRAÇÃO DE DADOS (VISÃO E AUDIÇÃO): Se o usuário enviar uma FOTO, VÍDEO ou ÁUDIO com dados de acesso (MAC, Key, Usuário, Senha):
                     - Analise a mídia com atenção. Escute o áudio ou veja a imagem para identificar MACs, Keys, logins e senhas.
                     - Use "save_customer_app" para salvar esses dados automaticamente no perfil do cliente.
                     - Informe ao cliente: "Identifiquei os dados no seu [áudio/foto] e já salvei aqui para você!"

                  3. NUTRICIONISTA: Se o usuário enviar uma FOTO DE COMIDA ou falar sobre o que COMEU:
                     - Aja como um nutricionista atencioso. Analise a foto e estime calorias.

                  Seja sempre breve, amigável e use emojis.
                  O cliente se chama ${userInfo?.name || 'Cliente'}.
                  O username dele é ${userInfo?.username || 'desconhecido'}.`;
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
    });

    const contents: any[] = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: "Entendido. Como posso ajudar o cliente hoje?" }] },
      ...history
    ];

    // Add media to the last user message if present
    const lastParts = contents[contents.length - 1].parts;
    if (media) {
      lastParts.push({
        inlineData: {
          data: media.data,
          mimeType: media.mimeType
        }
      });
    }

    const generatePixDeclaration = {
      name: "generate_pix",
      description: "Gera um QR Code Pix para renovação do cliente.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "O username do cliente no painel." },
          amount: { type: "number", description: "O valor da renovação (ex: 49.90)." }
        },
        required: ["username", "amount"]
      }
    };

    const getCustomerInfoDeclaration = {
      name: "get_customer_info",
      description: "Consulta os dados do cliente no banco de dados, incluindo data de vencimento e aplicativos salvos.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "O username do cliente para consulta." }
        },
        required: ["username"]
      }
    };

    const saveCustomerAppDeclaration = {
      name: "save_customer_app",
      description: "Salva os dados de um aplicativo (MAC, Key, Usuário, Senha) para um cliente.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "O username do cliente." },
          appName: { type: "string", description: "Nome do app (ex: IBO Player, XCIPTV)." },
          appModel: { type: "string", description: "Modelo (TV, Celular, etc)." },
          macAddress: { type: "string", description: "MAC Address se aplicável." },
          deviceKey: { type: "string", description: "Device Key / Senha do App se aplicável." },
          appUsername: { type: "string", description: "Usuário da lista (se aplicável)." },
          appPassword: { type: "string", description: "Senha da lista (se aplicável)." },
          providerUrl: { type: "string", description: "URL do servidor (DNS)." }
        },
        required: ["username", "appName"]
      }
    };

    const result = await model.generateContent({
      contents,
      tools: [{
        functionDeclarations: [generatePixDeclaration, getCustomerInfoDeclaration, saveCustomerAppDeclaration]
      }]
    });

    const response = result.response;
    const functionCalls = response.functionCalls() || [];
    const text = response.text() || '';

    return { 
      text, 
      functionCalls, 
      usage: response.usageMetadata,
      model: 'gemini-2.5-flash'
    };
  } catch (error: any) {
    console.error("Gemini Error Details:", {
      message: error.message,
      stack: error.stack,
      model: 'gemini-2.5-flash'
    });
    return { 
      text: `⚠️ IA: ${error.message || 'Erro inesperado'}.`, 
      functionCalls: [],
      model: 'gemini-2.5-flash'
    };
  }
}

// --- EFIBANK HELPERS ---
function getEfibankClient() {
  const options = {
    client_id: process.env.EFIBANK_CLIENT_ID,
    client_secret: process.env.EFIBANK_CLIENT_SECRET,
    sandbox: process.env.EFIBANK_SANDBOX === 'true',
    certificate: path.join(process.cwd(), 'certs/efibank_cert.p12')
  };
  
  if (!fs.existsSync(path.join(process.cwd(), 'certs'))) {
    fs.mkdirSync(path.join(process.cwd(), 'certs'));
  }
  
  if (process.env.EFIBANK_CERT_PATH) {
    const certBuffer = Buffer.from(process.env.EFIBANK_CERT_PATH, 'base64');
    fs.writeFileSync(options.certificate, certBuffer);
    console.log('Efibank: Certificado extraído para arquivo temporário com sucesso.');
  }

  return new Gerencianet(options);
}

// --- ROUTES ---

// Customers
app.get('/api/customers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar clientes', details: err.message });
  }
});

app.post('/api/customers', async (req, res) => {
  const { username, name, whatsapp, renewal_price, expiration_date, playlist_url } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO customers (username, name, whatsapp, renewal_price, expiration_date, playlist_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [username, name, whatsapp, renewal_price || 49.90, expiration_date, playlist_url]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao salvar cliente', details: err.message });
  }
});

app.put('/api/customers/:id', async (req, res) => {
  const { id } = req.params;
  const { username, name, whatsapp, renewal_price, expiration_date, playlist_url, status, lines_count } = req.body;
  try {
    const result = await pool.query(
      `UPDATE customers SET 
        username = $1, name = $2, whatsapp = $3, renewal_price = $4, 
        expiration_date = $5, playlist_url = $6, status = $7, lines_count = $8,
        updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [username, name, whatsapp, renewal_price, expiration_date, playlist_url, status, lines_count, id]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao atualizar cliente', details: err.message });
  }
});

app.delete('/api/customers/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM customers WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao excluir cliente', details: err.message });
  }
});

// Settings
app.get('/api/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM settings');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  const { key, value } = req.body;
  try {
    await pool.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()',
      [key, value]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Messages History
app.get('/api/messages/:remoteJid', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM messages WHERE remote_jid = $1 ORDER BY created_at ASC LIMIT 100',
      [req.params.remoteJid]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/contacts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM contacts ORDER BY last_message_time DESC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Pix Generation
app.post('/api/pix/generate', async (req, res) => {
  const { username, amount } = req.body;
  try {
    const gn = getEfibankClient();
    const pixKey = process.env.EFIBANK_PIX_KEY;
    
    const body = {
      calendario: { expiracao: 3600 },
      valor: { original: parseFloat(amount).toFixed(2) },
      chave: pixKey,
      solicitacaoPagador: `Renovação StartPainel - ${username}`
    };

    const response = await gn.pixCreateImmediateCharge({}, body);
    const qrcodeResponse = await gn.pixGenerateQRCode({ id: response.loc.id });
    
    await pool.query(
      'INSERT INTO pix_charges (txid, customer_username, amount) VALUES ($1, $2, $3)',
      [response.txid, username, amount]
    );

    res.json({
      qrcode_image: qrcodeResponse.imagemQrcode,
      copy_paste: qrcodeResponse.qrcode,
      txid: response.txid,
    });
  } catch (error: any) {
    console.error('Efibank Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Webhook for Pix Payment (Efibank)
app.post('/api/pix/webhook', express.json(), async (req, res) => {
  const pixArray = req.body.pix;
  if (!pixArray || pixArray.length === 0) return res.sendStatus(200);

  for (const p of pixArray) {
    const txid = p.txid;
    const chargeResult = await pool.query('SELECT * FROM pix_charges WHERE txid = $1', [txid]);
    const charge = chargeResult.rows[0];
    
    if (charge && !charge.processed) {
      // Logic for renewal automation could be here
      await pool.query('UPDATE pix_charges SET processed = true, status = $1 WHERE txid = $2', ['CONCLUIDA', txid]);
      
      await pool.query(
        'INSERT INTO messages (text, sender, type) VALUES ($1, $2, $3)',
        [`[SISTEMA] Pagamento confirmado! A renovação de ${charge.customer_username} foi processada.`, 'ai', 'text']
      );
    }
  }
  res.sendStatus(200);
});

// Automations Routes
app.get('/api/automations', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM automations ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/automations', async (req, res) => {
  const { name, siteUrl, username, password, type } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO automations (name, site_url, username, password, type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, siteUrl, username, password, type || 'ibo_player']
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/automations/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM automations WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ai-usage', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_requests,
        SUM(prompt_tokens) as total_prompt_tokens,
        SUM(candidates_tokens) as total_candidates_tokens,
        SUM(estimated_cost) as total_estimated_cost
      FROM ai_usage_logs
    `);
    
    const recentLogs = await pool.query(`
      SELECT * FROM ai_usage_logs 
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    res.json({
      summary: stats.rows[0],
      recent: recentLogs.rows
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Broadcast Route
app.post('/api/broadcast', async (req, res) => {
  const { message } = req.body;
  try {
    const settings = await pool.query('SELECT key, value FROM settings WHERE key LIKE $1', ['evolution_%']);
    const config: any = {};
    settings.rows.forEach(r => config[r.key] = r.value);
    
    const evo = new EvolutionService({
      apiUrl: config.evolution_api_url,
      token: config.evolution_token,
      instance: config.evolution_instance
    });

    const customers = await pool.query('SELECT name, whatsapp FROM customers WHERE whatsapp IS NOT NULL');
    
    res.json({ success: true, total: customers.rows.length });

    (async () => {
      for (const customer of customers.rows) {
        try {
          const jid = customer.whatsapp.includes('@') ? customer.whatsapp : `${customer.whatsapp.replace(/\D/g, '')}@s.whatsapp.net`;
          await evo.sendMessage(jid, message.replace(/{{name}}/g, customer.name || 'Cliente'));
          await new Promise(r => setTimeout(r, 2000));
        } catch (err) {}
      }
    })();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Evolution Webhook
app.post('/api/webhooks/evolution', async (req, res) => {
  let remoteJid = '';
  let pushName = 'Cliente';
  
  try {
    const data = req.body;
    console.log(`[Webhook] Recebido evento: ${data.event}`);

    // Respond 200 immediately
    res.status(200).send('OK');

    if (data.event === 'messages.upsert') {
      const msg = data.data.message;
      const key = data.data.key;
      remoteJid = key.remoteJid;
      const fromMe = key.fromMe;
      pushName = data.data.pushName || (remoteJid ? remoteJid.split('@')[0] : 'Cliente');
      
      if (fromMe) return;

      let text = '';
      if (msg?.conversation) text = msg.conversation;
      else if (msg?.extendedTextMessage?.text) text = msg.extendedTextMessage.text;
      else if (msg?.imageMessage?.caption) text = msg.imageMessage.caption;
      else if (msg?.videoMessage?.caption) text = msg.videoMessage.caption;
      else if (msg?.message?.conversation) text = msg.message.conversation;
      
      if (!text && !msg?.imageMessage && !msg?.audioMessage && !msg?.videoMessage) return;

      // 1. Upsert contact
      await pool.query(`
        INSERT INTO contacts (remote_jid, name, last_message, last_message_time, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        ON CONFLICT (remote_jid) DO UPDATE SET
          name = EXCLUDED.name,
          last_message = EXCLUDED.last_message,
          last_message_time = NOW(),
          updated_at = NOW()
      `, [remoteJid, pushName, text || '[Mídia]']);

      // 1.2 Identify Customer
      const cleanNumber = remoteJid.split('@')[0];
      const customerLookup = await pool.query(
        'SELECT id, username, name FROM customers WHERE whatsapp LIKE $1 OR whatsapp = $2',
        [`%${cleanNumber}%`, cleanNumber]
      );
      const identifiedCustomer = customerLookup.rows[0] || null;

      // 2. Save message
      await pool.query(
        'INSERT INTO messages (text, sender, type, remote_jid, contact_name) VALUES ($1, $2, $3, $4, $5)',
        [text || (msg?.imageMessage ? '[Imagem]' : (msg?.audioMessage ? '[Áudio]' : '[Mídia]')), 'customer', msg?.imageMessage ? 'image' : (msg?.audioMessage ? 'audio' : 'text'), remoteJid, pushName]
      );

      // 3. AI Processing
      console.log(`[Webhook] Processando mensagem de ${pushName}...`);
      
      // 3.1 History
      const historyRes = await pool.query(
        'SELECT text, sender, type FROM messages WHERE remote_jid = $1 ORDER BY created_at DESC LIMIT 10',
        [remoteJid]
      );
      const chatHistory = historyRes.rows.reverse().map(m => ({
        role: (m.sender === 'ai' || m.sender === 'attendant') ? 'model' : 'user',
        parts: [{ text: m.text || '[Mídia]' }]
      }));

      // 3.2 Media
      let mediaData = undefined;
      if (msg?.imageMessage || msg?.audioMessage || msg?.videoMessage) {
        try {
           const settings = await pool.query('SELECT key, value FROM settings WHERE key LIKE $1', ['evolution_%']);
           const config: any = {};
           settings.rows.forEach(r => config[r.key] = r.value);
           const evo = new EvolutionService({
             apiUrl: config.evolution_api_url,
             token: config.evolution_token,
             instance: config.evolution_instance
           });
           const mediaResult = await evo.loadMedia(key);
           if (mediaResult && mediaResult.base64) {
              mediaData = {
                data: mediaResult.base64.replace(/^data:.*?;base64,/, ""),
                mimeType: msg.imageMessage ? 'image/png' : (msg.audioMessage ? 'audio/ogg' : 'video/mp4')
              };
           }
        } catch (mediaErr) {}
      }

      const aiResult = await handleAIChat(remoteJid, chatHistory, identifiedCustomer || { name: pushName }, mediaData);
      
      // 3.4 Log Usage
      try {
        if (aiResult.usage) {
          const { promptTokenCount, candidatesTokenCount } = aiResult.usage as any;
          const cost = (promptTokenCount * 0.000000075) + (candidatesTokenCount * 0.00000030);
          await pool.query(
            'INSERT INTO ai_usage_logs (model, type, prompt_tokens, candidates_tokens, estimated_cost) VALUES ($1, $2, $3, $4, $5)',
            [aiResult.model || 'gemini-2.5-flash', 'chat_webhook', promptTokenCount, candidatesTokenCount, cost]
          );
        }
      } catch (e) {}

      // 3.5 Respond
      if (aiResult.text) {
        const settings = await pool.query('SELECT key, value FROM settings WHERE key LIKE $1', ['evolution_%']);
        const config: any = {};
        settings.rows.forEach(r => config[r.key] = r.value);
        const evo = new EvolutionService({
           apiUrl: config.evolution_api_url,
           token: config.evolution_token,
           instance: config.evolution_instance
        });

        const shouldSendAudio = msg?.audioMessage || (Math.random() > 0.7);
        if (shouldSendAudio) {
           try {
             const tts = new EdgeTTS();
             const buffer = await tts.tts(aiResult.text, { voice: 'pt-BR-AntonioNeural' });
             await evo.sendAudio(remoteJid, `data:audio/mp3;base64,${buffer.toString('base64')}`);
           } catch (ttsErr) {
             await evo.sendMessage(remoteJid, aiResult.text);
           }
        } else {
           await evo.sendMessage(remoteJid, aiResult.text);
        }
        
        await pool.query(
          'INSERT INTO messages (text, sender, type, remote_jid, contact_name) VALUES ($1, $2, $3, $4, $5)',
          [aiResult.text, 'ai', 'text', remoteJid, pushName]
        );
      }

      // 3.6 Tool Calls
      for (const call of aiResult.functionCalls) {
        if (call.name === 'generate_pix') {
           const { username, amount } = call.args as any;
           await handlePixGenerationTool(remoteJid, pushName, username, amount);
        } else if (call.name === 'get_customer_info') {
           const { username } = call.args as any;
           await handleCustomerInfoTool(remoteJid, pushName, username);
        } else if (call.name === 'save_customer_app') {
           await handleSaveAppTool(remoteJid, pushName, call.args as any);
        }
      }
    }
  } catch (err: any) {
    console.error('[Webhook Global Error]:', err);
    try {
      await pool.query(
        'INSERT INTO messages (text, sender, type, remote_jid, contact_name) VALUES ($1, $2, $3, $4, $5)',
        [`⚠️ Erro no robô: ${err.message}`, 'ai', 'text', remoteJid, pushName]
      );
    } catch (dbE) {}
  }
});

// Restore deleted helper functions and start server... (skipping for brevity but including in final file)

async function handlePixGenerationTool(remoteJid: string, pushName: string, username: string, amount: number) {
  try {
    const settings = await pool.query('SELECT key, value FROM settings WHERE key LIKE $1', ['evolution_%']);
    const config: any = {};
    settings.rows.forEach(r => config[r.key] = r.value);
    const evo = new EvolutionService(config as any);
    const pixKey = process.env.EFIBANK_PIX_KEY;
    if (!pixKey) return;
    const gn = getEfibankClient();
    const body = {
      calendario: { expiracao: 3600 },
      valor: { original: parseFloat(amount as any).toFixed(2) },
      chave: pixKey,
      solicitacaoPagador: `Renovação StartPainel - ${username}`
    };
    const response = await gn.pixCreateImmediateCharge({}, body);
    const qrcodeResponse = await gn.pixGenerateQRCode({ id: response.loc.id });
    await pool.query('INSERT INTO pix_charges (txid, customer_username, amount) VALUES ($1, $2, $3)', [response.txid, username, amount]);
    await evo.sendMedia(remoteJid, qrcodeResponse.imagemQrcode, `Valor: R$ ${amount}\nCopia e Cola abaixo:`, 'pix.png');
    await evo.sendMessage(remoteJid, qrcodeResponse.qrcode);
  } catch (e) {}
}

async function handleCustomerInfoTool(remoteJid: string, pushName: string, username: string) {
  try {
     const result = await pool.query(`SELECT * FROM customers WHERE username = $1`, [username]);
     if (result.rows.length === 0) return;
     const c = result.rows[0];
     const text = `✅ Dados de *${c.username}*:\nVencimento: ${c.expiration_date || 'N/A'}`;
     const settings = await pool.query('SELECT key, value FROM settings WHERE key LIKE $1', ['evolution_%']);
     const config: any = {};
     settings.rows.forEach(r => config[r.key] = r.value);
     const evo = new EvolutionService(config as any);
     await evo.sendMessage(remoteJid, text);
  } catch (e) {}
}

async function handleSaveAppTool(remoteJid: string, pushName: string, args: any) {
  try {
    const { username, appName, appModel, macAddress, deviceKey, appUsername, appPassword, providerUrl } = args;
    const customerRes = await pool.query('SELECT id FROM customers WHERE username = $1', [username]);
    if (customerRes.rows.length === 0) return;
    const customerId = customerRes.rows[0].id;
    await pool.query(
      `INSERT INTO customer_apps (customer_id, app_name, app_model, access_type, mac_address, device_key, username, password, provider_url, is_tv) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [customerId, appName, appModel, macAddress ? 'mac_key' : 'user_pass', macAddress, deviceKey, appUsername, appPassword, providerUrl, true]
    );
    const settings = await pool.query('SELECT key, value FROM settings WHERE key LIKE $1', ['evolution_%']);
    const config: any = {};
    settings.rows.forEach(r => config[r.key] = r.value);
    const evo = new EvolutionService(config as any);
    await evo.sendMessage(remoteJid, `✅ Salvei os dados do seu *${appName}*!`);
  } catch (e) {}
}

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true, hmr: true, host: '0.0.0.0' }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false })); 
    app.get('/api/health', (req, res) => res.json({ status: 'ok', db: dbStatus }));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
  });
}

startServer();
