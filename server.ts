import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';
import Gerencianet from 'gn-api-sdk-node';
import pkg from 'pg';
const { Pool } = pkg;
import { GoogleGenerativeAI } from "@google/generative-ai";
import { renewClientPuppeteer, createClientAndGetPlaylist, activateUltraPlayer } from './src/services/startpainel-puppeteer.js';
import { runIboPlayerAutomation } from './src/services/ibo-automation.js';
import { EvolutionService } from './src/services/evolution-api.js';

// Initialize Postgres Pool
const DB_URL = process.env.DATABASE_URL || 'postgres://postgres:EUUQna43FyrX3Vr74SYTihqqTkvQhMr630clCNtuJlfgeiS4I5lSkFUq7achOqsv@187.77.230.251:5436/postgres';

console.log('PG: Checking database connection...');
if (!process.env.DATABASE_URL) {
  console.log('PG: Using fallback URL provided by user');
} else {
  console.log('PG: DATABASE_URL environment variable is present');
}

const pool = new Pool({
  connectionString: DB_URL,
  ssl: false, // Forces SSL off to test connection to public IP
  connectionTimeoutMillis: 10000 // 10 seconds timeout
});

pool.on('error', (err) => {
  console.error('PG: Unexpected error on idle client', err);
});

let dbStatus = 'connecting';
let dbError = '';

// Initialize DB tables
async function initDB() {
  let client;
  try {
    console.log('PostgreSQL: Attempting to initialize database...');
    if (!DB_URL) throw new Error("DATABASE_URL is not defined");

    client = await pool.connect();
    console.log('PG: Successfully connected to PostgreSQL server');
    
    // Create all tables
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
        whatsapp TEXT,
        renewal_price DECIMAL(10,2) DEFAULT 49.90,
        cost_per_credit DECIMAL(10,2) DEFAULT 0.00,
        amount_paid DECIMAL(10,2) DEFAULT 0.00,
        lines_count INTEGER DEFAULT 1,
        status TEXT DEFAULT 'active',
        expiration_date DATE,
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
        estimated_cost DECIMAL(10,5),
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

    // Default settings
    const settings = [
      ['evolution_api_url', 'https://evo.appbr.pro'],
      ['evolution_instance', 'suporte lucas'],
      ['evolution_token', 'CF68A43EB928-462D-B2CC-C30D4203BE5A'],
      ['evolution_sender', '5588988584960']
    ];

    for (const [key, val] of settings) {
      await client.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, val]);
    }

    console.log('PostgreSQL: All tables initialized successfully');
    dbStatus = 'connected';
    return { success: true };
  } catch (err: any) {
    console.error('PostgreSQL: Initialization error:', err);
    dbStatus = 'error';
    dbError = err.message;
    return { success: false, error: err.message };
  } finally {
    if (client) client.release();
  }
}
initDB();

async function handleAIChat(remoteJid: string, chatHistory: any[], userInfo: { name: string }) {
  try {
    const settingsResult = await pool.query('SELECT value FROM settings WHERE key = $1', ['gemini_api_key']);
    let apiKey = settingsResult.rows[0]?.value || process.env.GEMINI_API_KEY;

    if (!apiKey || !apiKey.startsWith('AIza')) {
      return { text: "Configuração da IA Pendente: A chave GEMINI_API_KEY não foi encontrada ou é inválida." };
    }

    apiKey = apiKey.trim().replace(/[\u0000-\u001F\u007F-\u009F]/g, "").replace(/^["']|["']$/g, '');

    const customersResult = await pool.query('SELECT username, renewal_price FROM customers');
    let clientPricesContext = "";
    if (customersResult.rows.length > 0) {
      clientPricesContext = "\nLista de preços específicos por cliente (se o usuário for um destes, use o valor exato):\n";
      customersResult.rows.forEach((c: any) => {
        clientPricesContext += `- ${c.username}: R$ ${parseFloat(c.renewal_price).toFixed(2)}\n`;
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const generatePixDeclaration = {
      name: 'generate_pix',
      description: 'Gera uma cobrança Pix (QR Code e Copia/Cola) para o cliente efetuar o pagamento. Sempre use essa ferramenta quando o cliente concordar com a renovação e precisar pagar. Não crie o pix sem saber o nome de usuário do cliente.',
      parameters: {
        type: "OBJECT",
        properties: {
          username: { type: "STRING", description: 'O nome de usuário do painel StartPainel que será renovado.' },
          amount: { type: "NUMBER", description: 'O valor da renovação em reais.' },
        },
        required: ['username', 'amount'],
      },
    };

    const getCustomerInfoDeclaration = {
      name: 'get_customer_info',
      description: 'Busca informações detalhadas de um cliente, incluindo seus aplicativos cadastrados (TV, Celular), dados de acesso (MAC, Senha), links de download e data de vencimento. Use isso quando o cliente pedir seus dados de acesso ou perguntar quando vence.',
      parameters: {
        type: "OBJECT",
        properties: {
          username: { type: "STRING", description: 'O nome de usuário do cliente no sistema.' },
        },
        required: ['username'],
      },
    };

    const systemPrompt = `Você é um assistente multi-modal para o StartPainel.
                  
                  Regras de Atuação:
                  1. SUPORTE STARTPAINEL: Se o usuário quiser renovar ou tiver dúvidas do painel, aja como suporte humano, breve, estilo WhatsApp.
                     - Pergunte o username se não souber.
                     - Use "generate_pix" para cobranças.
                     - Contexto de Preços: ${clientPricesContext}
                     - Preço padrão: 49.90.
                  
                  2. NUTRICIONISTA: Se o usuário enviar uma FOTO DE COMIDA ou falar sobre o que COMEU/VAI COMER:
                     - Aja como um nutricionista atencioso.
                     - Analise os alimentos (se for foto, identifique o que tem no prato).
                     - Estime calorias e macronutrientes de forma aproximada.
                     - Dê dicas de saúde ou substituições saudáveis.
                     - Seja motivador.

                  3. Se o usuário mandar algo que não se encaixa em nenhum dos dois, responda de forma geral e amigável.
                  
                  Mantenha sempre o estilo breve e com emojis.
                  O cliente se chama ${userInfo?.name || 'Cliente'}.`;

    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
    });

    // Prepare contents with explicit roles and alternating turns
    const contents: any[] = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Entendido! Estou pronto para ajudar. 😊' }] }
    ];

    // Add history but omit the very last message (which we will send as the current prompt)
    if (chatHistory.length > 1) {
      chatHistory.slice(0, -1).forEach((m: any) => {
        contents.push({
          role: m.role,
          parts: m.parts
        });
      });
    }

    // Always send the last message as the final user part
    const lastMessage = chatHistory[chatHistory.length - 1]?.parts[0]?.text || 'Olá';
    contents.push({ role: 'user', parts: [{ text: lastMessage }] });

    const result = await model.generateContent({
      contents,
      tools: [{
        functionDeclarations: [generatePixDeclaration, getCustomerInfoDeclaration]
      }]
    });

    const response = result.response;
    const functionCalls = response.functionCalls() || [];
    const text = response.text() || '';

    return { text, functionCalls };
  } catch (error: any) {
    console.error("Gemini Error:", error);
    throw error;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Initialize Efibank Certificate if provided as raw content
if (process.env.EFIBANK_CERT_PATH && (process.env.EFIBANK_CERT_PATH.length > 500 || process.env.EFIBANK_CERT_PATH.includes('MII'))) {
  try {
    const tempCertPath = path.resolve(process.cwd(), 'temp_cert.p12');
    const buffer = Buffer.from(process.env.EFIBANK_CERT_PATH, 'base64');
    fs.writeFileSync(tempCertPath, buffer);
    console.log('Efibank: Certificado extraído para arquivo temporário com sucesso.');
  } catch (e) {
    console.error('Efibank: Erro ao extrair certificado do ENV:', e);
  }
}

// Efibank setup
function getEfibankClient() {
  const isSandbox = process.env.EFIBANK_SANDBOX === 'true';
  const clientId = process.env.EFIBANK_CLIENT_ID;
  const clientSecret = process.env.EFIBANK_CLIENT_SECRET;
  const certPathStr = process.env.EFIBANK_CERT_PATH;

  if (!clientId || !clientSecret) {
    throw new Error('EFIBANK_CLIENT_ID ou EFIBANK_CLIENT_SECRET não configurados no .env');
  }

  let finalCertPath = '';
  if (certPathStr) {
    if (certPathStr.length > 500 || certPathStr.includes('MII')) {
      finalCertPath = path.resolve(process.cwd(), 'temp_cert.p12');
    } else {
      finalCertPath = path.isAbsolute(certPathStr) ? certPathStr : path.resolve(process.cwd(), certPathStr);
    }
  } else {
    // Fallback para arquivos conhecidos se o path não estiver no env
    const fallbackFile = isSandbox ? 'homologacao-906554-shopcrat.p12' : 'producao-906554-shopcrat.p12';
    finalCertPath = path.resolve(process.cwd(), fallbackFile);
  }

  if (!fs.existsSync(finalCertPath)) {
    throw new Error(`Certificado Efibank não encontrado em: ${finalCertPath}`);
  }

  const efibankOptions = {
    sandbox: isSandbox,
    client_id: clientId,
    client_secret: clientSecret,
    certificate: finalCertPath,
  };
  
  return new Gerencianet(efibankOptions);
}

// --- API ROUTES ---

// --- StartPainel Renewal Logic (Hybrid Support) ---
const WORKER_URL = process.env.RENEWAL_WORKER_URL; // Ex: https://seu-link.trycloudflare.com
const WORKER_SECRET = process.env.WORKER_SECRET || 'startpainel_secret_key_2024';

// Rota que o Notebook usa para receber ordens do Coolify
app.post('/api/worker/renew', async (req, res) => {
  const { username, secret } = req.body;
  
  if (secret !== WORKER_SECRET) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  console.log(`[Worker Mode] Recebida ordem de renovação para: ${username}`);
  try {
    const result = await renewClientPuppeteer(username);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Função que decide se renova aqui ou no notebook
async function processRenewal(username: string) {
  if (WORKER_URL) {
    console.log(`[Main] Encaminhando renovação de "${username}" para o Notebook: ${WORKER_URL}`);
    try {
      const response = await axios.post(`${WORKER_URL.replace(/\/$/, '')}/api/worker/renew`, {
        username,
        secret: WORKER_SECRET
      }, { timeout: 120000 });
      return response.data;
    } catch (err: any) {
      console.error(`[Main] Erro ao chamar notebook: ${err.message}`);
      return { success: false, message: `O Notebook parece estar offline: ${err.message}` };
    }
  } else {
    console.log(`[Local] Executando renovação local para: ${username}`);
    return await renewClientPuppeteer(username);
  }
}

app.get('/api/panel/status', async (req, res) => {
  const user = process.env.STARTPAINEL_ADMIN_USER || '';
  const url  = process.env.STARTPAINEL_URL || 'https://cms.startpainel.cc';
  
  res.json({ 
    configured: !!user,
    mode: WORKER_URL ? 'Híbrido (Notebook)' : 'Direto (Servidor)',
    workerUrl: WORKER_URL || 'Nenhum',
    url
  });
});

app.post('/api/panel/renew/:username', async (req, res) => {
  const { username } = req.params;
  try {
    const result = await processRenewal(username);
    if (result.success) {
      res.json({ success: true, message: result.message, clientId: result.clientId });
    } else {
      res.status(500).json({ error: result.message });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- PG DATABASE ROUTES ---
app.get('/api/db-status', (req, res) => {
  res.json({ status: dbStatus, error: dbError });
});

app.get('/api/db-migrate', async (req, res) => {
  const result = await initDB();
  res.json(result);
});

app.get('/api/customers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, 
             COALESCE(json_agg(a.*) FILTER (WHERE a.id IS NOT NULL), '[]') as apps
      FROM customers c
      LEFT JOIN customer_apps a ON c.id = a.customer_id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar clientes no Postgres', details: err.message });
  }
});

app.post('/api/customers', express.json(), async (req, res) => {
  const { username, whatsapp, renewalPrice, costPerCredit, amountPaid, expirationDate, linesCount } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO customers (username, whatsapp, renewal_price, cost_per_credit, amount_paid, expiration_date, lines_count) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [username, whatsapp, renewalPrice || 49.90, costPerCredit || 0, amountPaid || 0, expirationDate, linesCount || 1]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('Postgres Error (Create Customer):', err);
    res.status(500).json({ error: 'Erro ao criar cliente no Postgres', details: err.message });
  }
});

app.put('/api/customers/:id', express.json(), async (req, res) => {
  const { id } = req.params;
  const { renewalPrice, costPerCredit, amountPaid, expirationDate, status, lines_count } = req.body;
  try {
    const result = await pool.query(
      'UPDATE customers SET renewal_price = $1, cost_per_credit = $2, amount_paid = $3, expiration_date = $4, status = $5, lines_count = $6 WHERE id = $7 RETURNING *',
      [renewalPrice, costPerCredit, amountPaid, expirationDate, status, lines_count, id]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao atualizar cliente no Postgres', details: err.message });
  }
});

app.delete('/api/customers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM customers WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao excluir cliente no Postgres', details: err.message });
  }
});

// --- Customer Apps Routes ---
app.get('/api/customers/by-username/:username', async (req, res) => {
  const { username } = req.params;
  try {
    const result = await pool.query(`
      SELECT c.*, 
             COALESCE(json_agg(a.*) FILTER (WHERE a.id IS NOT NULL), '[]') as apps
      FROM customers c
      LEFT JOIN customer_apps a ON c.id = a.customer_id
      WHERE c.username = $1
      GROUP BY c.id
    `, [username]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar cliente', details: err.message });
  }
});

app.post('/api/customers/:id/apps', express.json(), async (req, res) => {
  const { id } = req.params;
  const { 
    appName, appModel, accessType, macAddress, deviceKey, 
    appUsername, appPassword, username, password, 
    providerUrl, androidLink, iosLink, iconUrl, appSiteUrl, isTv 
  } = req.body;
  
  const finalUsername = appUsername || username;
  const finalPassword = appPassword || password;

  try {
    const result = await pool.query(
      `INSERT INTO customer_apps 
       (customer_id, app_name, app_model, access_type, mac_address, device_key, username, password, provider_url, android_link, ios_link, icon_url, app_site_url, is_tv) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [id, appName, appModel, accessType, macAddress, deviceKey, finalUsername, finalPassword, providerUrl, androidLink, iosLink, iconUrl, appSiteUrl, isTv ?? true]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao cadastrar app', details: err.message });
  }
});

app.delete('/api/apps/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM customer_apps WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao deletar app', details: err.message });
  }
});

app.put('/api/apps/:id', express.json(), async (req, res) => {
  const { id } = req.params;
  const { 
    app_name, app_model, access_type, mac_address, device_key, 
    username, password, provider_url, android_link, ios_link, icon_url, app_site_url, is_tv 
  } = req.body;
  try {
    const result = await pool.query(
      `UPDATE customer_apps SET 
       app_name = $1, app_model = $2, access_type = $3, mac_address = $4, device_key = $5, 
       username = $6, password = $7, provider_url = $8, android_link = $9, ios_link = $10, 
       icon_url = $11, app_site_url = $12, is_tv = $13 
       WHERE id = $14 RETURNING *`,
      [app_name, app_model, access_type, mac_address, device_key, username, password, provider_url, android_link, ios_link, icon_url, app_site_url, is_tv, id]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao atualizar app', details: err.message });
  }
});

// --- Automations Routes ---
app.get('/api/automations', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM automations ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar automações' });
  }
});

app.post('/api/automations', express.json(), async (req, res) => {
  const { name, siteUrl, username, password, type } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO automations (name, site_url, username, password, type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, siteUrl, username, password, type || 'generic']
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao criar automação' });
  }
});

app.delete('/api/automations/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM automations WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao excluir automação' });
  }
});

app.post('/api/automations/ibo/run', express.json(), async (req, res) => {
  const { mac, key } = req.body;
  if (!mac || !key) return res.status(400).json({ error: 'MAC e Key são obrigatórios' });
  try {
    const result = await runIboPlayerAutomation(mac, key);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Financial Route ---
app.get('/api/financials', async (req, res) => {
  try {
    const totalsResult = await pool.query(`
      SELECT 
        SUM(amount_paid) as total_received,
        SUM(cost_per_credit * lines_count) as total_costs,
        SUM(amount_paid - (cost_per_credit * lines_count)) as total_profit,
        json_agg(json_build_object('username', username, 'paid', amount_paid)) FILTER (WHERE amount_paid > 0) as paying_customers
      FROM customers
      WHERE created_at >= date_trunc('month', current_date)
    `);

    // Grouping by date for the chart (using updated_at or created_at for simplicity)
    const chartResult = await pool.query(`
      SELECT 
        to_char(updated_at, 'DD/MM') as date,
        SUM(amount_paid) as "Receita",
        SUM(cost_per_credit * lines_count) as "Custo",
        SUM(amount_paid - (cost_per_credit * lines_count)) as "Lucro"
      FROM customers
      WHERE amount_paid > 0
      GROUP BY to_char(updated_at, 'DD/MM')
      ORDER BY date ASC
      LIMIT 30
    `);

    const responseData = {
      ...totalsResult.rows[0],
      chart_data: chartResult.rows
    };

    res.json(responseData);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar dados financeiros', details: err.message });
  }
});

// --- MESSAGES ROUTES ---
app.get('/api/contacts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM contacts ORDER BY last_message_time DESC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar contatos', details: err.message });
  }
});

app.get('/api/messages', async (req, res) => {
  const { remoteJid } = req.query;
  try {
    let query = 'SELECT id, text, sender, type, metadata, image_data as "imageData", created_at FROM messages';
    let params: any[] = [];
    
    if (remoteJid) {
      query += ' WHERE remote_jid = $1';
      params.push(remoteJid);
    }
    
    query += ' ORDER BY created_at ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar mensagens', details: err.message });
  }
});

app.post('/api/messages', async (req, res) => {
    const { text, sender, type, metadata, imageData, remoteJid, contactName } = req.body;
    try {
      // 1. Save to DB
      const result = await pool.query(
        'INSERT INTO messages (text, sender, type, metadata, image_data, remote_jid, contact_name) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [text, sender, type || 'text', metadata || {}, imageData || null, remoteJid || null, contactName || null]
      );

      // 2. If it's from user (attendant), send to Evolution API
      if (sender === 'user' && remoteJid) {
        try {
          const settings = await pool.query('SELECT key, value FROM settings WHERE key LIKE $1', ['evolution_%']);
          const config: any = {};
          settings.rows.forEach(r => config[r.key] = r.value);
          
          if (config.evolution_api_url && config.evolution_token && config.evolution_instance) {
            const evo = new EvolutionService({
              apiUrl: config.evolution_api_url,
              token: config.evolution_token,
              instance: config.evolution_instance
            });
            
            if (type === 'image' && imageData) {
              await evo.sendMedia(remoteJid, imageData, text || '', 'image.png');
            } else {
              await evo.sendMessage(remoteJid, text);
            }
          }
        } catch (evoErr: any) {
          console.error('[Server] Evolution API send error:', evoErr.message);
        }
      }

      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar mensagem', details: err.message });
    }
});
// --- SETTINGS ROUTES ---
app.get('/api/settings/:key', async (req, res) => {
  const { key } = req.params;
  try {
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    if (result.rows.length > 0) {
      res.json({ value: result.rows[0].value });
    } else {
      res.json({ value: null });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar configuração', details: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  const { key, value } = req.body;
  try {
    await pool.query(
      'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP',
      [key, value]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao salvar configuração', details: err.message });
  }
});

// --- GEMINI CHAT ROUTE ---
app.post('/api/chat', async (req, res) => {
  const { messages: chatHistory, userInfo } = req.body;
  try {
    const result = await handleAIChat('', chatHistory, userInfo);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Efibank Pix Generation
app.get('/api/pix/status/:txid', async (req, res) => {
  const { txid } = req.params;
  try {
    const gn = getEfibankClient();
    const response = await gn.pixDetailCharge({ txid });
    const status = response.status;
    
    // Check if we need to process renewal
    if (status === 'CONCLUIDA') {
      const chargeResult = await pool.query('SELECT * FROM pix_charges WHERE txid = $1', [txid]);
      const charge = chargeResult.rows[0];
      
      if (charge && !charge.processed) {
        console.log(`PG: Payment confirmed for TXID ${txid}. Triggering renewal for ${charge.username}...`);
        
        try {
          const renewResult = await renewClientPuppeteer(charge.username);
          if (renewResult.success) {
            console.log(`PG: Renewal successful for ${charge.username}`);
            await pool.query('UPDATE pix_charges SET processed = true, status = $1 WHERE txid = $2', [status, txid]);
          } else {
            console.error(`PG: Panel renewal failed for ${charge.username}: ${renewResult.message}`);
          }
        } catch (renewError) {
          console.error('PG: Error during automatic renewal:', renewError);
        }
      } else {
        // Just update status if already processed or not found
        await pool.query('UPDATE pix_charges SET status = $1 WHERE txid = $2', [status, txid]);
      }
    } else {
      // Update status for non-concluded charges
      await pool.query('UPDATE pix_charges SET status = $1 WHERE txid = $2', [status, txid]);
    }
    
    res.json({ status }); 
  } catch (error) {
    console.error('Efibank Detail Error:', error);
    res.status(500).json({ error: 'Erro ao consultar Pix' });
  }
});

// Legado - mantido apenas para compatibilidade se necessário, mas unificado acima
// app.post('/api/pix/webhook(/pix)?', ...);

// Debug route to check Efibank setup
app.get('/api/pix/debug', (req, res) => {
  const isSandbox = process.env.EFIBANK_SANDBOX === 'true';
  const clientId = process.env.EFIBANK_CLIENT_ID;
  const clientSecret = process.env.EFIBANK_CLIENT_SECRET;
  const certPathStr = process.env.EFIBANK_CERT_PATH;
  const pixKey = process.env.EFIBANK_PIX_KEY;

  const fallbackFile = isSandbox ? 'homologacao-906554-shopcrat.p12' : 'producao-906554-shopcrat.p12';
  let finalCertPath = '';
  let usingTemp = false;

  if (certPathStr) {
    if (certPathStr.length > 500 || certPathStr.includes('MII')) {
      finalCertPath = path.resolve(process.cwd(), 'temp_cert.p12');
      usingTemp = true;
    } else {
      finalCertPath = path.isAbsolute(certPathStr) ? certPathStr : path.resolve(process.cwd(), certPathStr);
    }
  } else {
    finalCertPath = path.resolve(process.cwd(), fallbackFile);
  }

  res.json({
    hasClientId: !!clientId,
    hasClientSecret: !!clientSecret,
    isSandbox,
    certPath: finalCertPath,
    certExists: fs.existsSync(finalCertPath),
    usingTemp,
    hasPixKey: !!pixKey && pixKey !== 'REPLACE_WITH_YOUR_PIX_KEY',
    pixKey: pixKey === 'REPLACE_WITH_YOUR_PIX_KEY' ? 'NOT_SET' : (pixKey ? 'SET' : 'MISSING'),
    nodeEnv: process.env.NODE_ENV
  });
});

app.post('/api/pix/create', async (req, res) => {
  const { amount, username } = req.body;
  
  if (!process.env.EFIBANK_PIX_KEY || process.env.EFIBANK_PIX_KEY === 'REPLACE_WITH_YOUR_PIX_KEY') {
    return res.status(400).json({ error: 'Chave Pix não configurada pelo administrador.' });
  }

  const body = {
    calendario: {
      expiracao: 3600,
    },
    valor: {
      original: parseFloat(amount).toFixed(2),
    },
    chave: process.env.EFIBANK_PIX_KEY,
    solicitacaoPagador: `Renovação StartPainel - ${username}`.substring(0, 140),
  };

  try {
    const gn = getEfibankClient();
    const response = await gn.pixCreateImmediateCharge({}, body);
    const qrcodeResponse = await gn.pixGenerateQRCode({ id: response.loc.id });
    
    // Save to database
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
    console.error('Efibank Error Details:', error.mensagem || error.message || error);
    if (error.error_description) console.error('Description:', error.error_description);
    
    // Return more details to the frontend for debugging
    const errorMessage = error.mensagem || error.message || 'Erro ao gerar Pix na Efibank';
    const errorDetail = error.error_description || (error.erros ? JSON.stringify(error.erros) : '');
    
    res.status(500).json({ 
      error: errorMessage, 
      details: errorDetail
    });
  }
});

// Webhook for Pix Payment (Efibank)
app.post('/api/pix/webhook', express.json(), async (req, res) => {
  const pixArray = req.body.pix;
  if (!pixArray || pixArray.length === 0) return res.sendStatus(200);

  for (const p of pixArray) {
    const txid = p.txid;
    console.log(`PG: Webhook message: Pagamento Pix recebido! TXID: ${txid}`);
    
    const chargeResult = await pool.query('SELECT * FROM pix_charges WHERE txid = $1', [txid]);
    const charge = chargeResult.rows[0];
    
    if (charge && !charge.processed) {
      console.log(`PG: Webhook processing payment for ${charge.customer_username}...`);
      
      try {
        const renewResult = await processRenewal(charge.customer_username);
        if (renewResult.success) {
          console.log(`PG: Renewal successful for ${charge.customer_username}`);
          await pool.query('UPDATE pix_charges SET processed = true, status = $1 WHERE txid = $2', ['CONCLUIDA', txid]);
          
          await pool.query(
            'INSERT INTO messages (text, sender, type) VALUES ($1, $2, $3)',
            [`[SISTEMA] Pagamento confirmado via Webhook! A conta de ${charge.customer_username} foi renovada.`, 'ai', 'text']
          );
        } else {
          console.error(`PG: Renewal failed for ${charge.customer_username}: ${renewResult.message}`);
        }
      } catch (err) {
        console.error('PG: Webhook renewal error:', err);
      }
    }
  }
  res.sendStatus(200);
});

// Force Renew Route for Testing
app.post('/api/test/force-renew/:txid', async (req, res) => {
  const { txid } = req.params;
  try {
    const chargeResult = await pool.query('SELECT * FROM pix_charges WHERE txid = $1', [txid]);
    const charge = chargeResult.rows[0];
    
    if (!charge) {
      return res.status(404).json({ error: 'Cobrança não encontrada no banco local' });
    }

    console.log(`TEST: Forcing renewal for ${charge.username} (TXID: ${txid})`);
    
    const renewResult = await processRenewal(charge.username);
    if (renewResult.success) {
      await pool.query('UPDATE pix_charges SET processed = true, status = $1 WHERE txid = $2', ['CONCLUIDA', txid]);
      res.json({ success: true, message: `Renovação forçada com sucesso para ${charge.username}` });
    } else {
      res.status(500).json({ error: renewResult.message || 'Falha ao renovar cliente no painel' });
    }
  } catch (err: any) {
    console.error('Test Force Renew Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// StartPainel Automation manual trigger
app.post('/api/panel/extend', async (req, res) => {
  const { username } = req.body;
  try {
    const result = await renewClientPuppeteer(username);
    if (!result.success) throw new Error(result.message);
    res.json({ success: true, message: result.message });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- AUTOMATIONS ROUTES ---
app.get('/api/automations', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM automations ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar automações', details: err.message });
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
    res.status(500).json({ error: 'Erro ao salvar automação', details: err.message });
  }
});

app.delete('/api/automations/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM automations WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao excluir automação', details: err.message });
  }
});

app.post('/api/automations/ibo/run', async (req, res) => {
  const { mac, key, playlistUrl, targetUrl } = req.body;
  try {
    // Get Gemini Key from settings
    const settingResult = await pool.query('SELECT value FROM settings WHERE key = $1', ['gemini_api_key']);
    const geminiKey = settingResult.rows[0]?.value;

    const result = await runIboPlayerAutomation(mac, key, playlistUrl, geminiKey, targetUrl);
    
    // Log AI Usage if available
    if (result.aiUsage) {
      const { promptTokens, candidatesTokens, model } = result.aiUsage;
      const cost = (promptTokens * 0.000000075) + (candidatesTokens * 0.00000030);
      await pool.query(
        'INSERT INTO ai_usage_logs (model, type, prompt_tokens, candidates_tokens, estimated_cost) VALUES ($1, $2, $3, $4, $5)',
        [model, 'captcha_resolution', promptTokens, candidatesTokens, cost]
      );
    }

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
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
    res.status(500).json({ error: 'Erro ao buscar uso de IA', details: err.message });
  }
});

app.post('/api/automations/startpainel/create-client', async (req, res) => {
  const { username } = req.body;
  try {
    const result = await createClientAndGetPlaylist(username);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/automations/startpainel/activate-ultra', async (req, res) => {
  const { username, mac } = req.body;
  try {
    const result = await activateUltraPlayer(username, mac);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- EVOLUTION WEBHOOK ---
app.post('/api/webhooks/evolution', async (req, res) => {
  console.log(`[Webhook] Received event: ${req.body?.event} from instance: ${req.body?.instance}`);
  const { event, data, instance } = req.body;
  
  // Respond immediately to Evolution API
  res.json({ success: true });

  if (event === 'messages.upsert') {
    try {
      const msg = data.message;
      const key = data.key;
      const remoteJid = key.remoteJid;
      const fromMe = key.fromMe;
      const pushName = data.pushName || remoteJid.split('@')[0];
      
      let text = '';
      if (msg?.conversation) text = msg.conversation;
      else if (msg?.extendedTextMessage?.text) text = msg.extendedTextMessage.text;
      else if (msg?.imageMessage?.caption) text = msg.imageMessage.caption;
      else if (msg?.videoMessage?.caption) text = msg.videoMessage.caption;
      else if (msg?.message?.conversation) text = msg.message.conversation; // nesting variant
      
      if (!text && !msg?.imageMessage) return; // Ignore if no text/image

      // 1. Upsert contact
      await pool.query(`
        INSERT INTO contacts (remote_jid, name, last_message, last_message_time, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        ON CONFLICT (remote_jid) DO UPDATE SET
          name = EXCLUDED.name,
          last_message = EXCLUDED.last_message,
          last_message_time = NOW(),
          updated_at = NOW(),
          unread_count = CASE WHEN $4 = false THEN contacts.unread_count + 1 ELSE contacts.unread_count END
      `, [remoteJid, pushName, text || '[Mídia]', fromMe]);

      // 2. Save message (sender: 'customer' for user, 'attendant' for me)
      await pool.query(
        'INSERT INTO messages (text, sender, type, remote_jid, contact_name) VALUES ($1, $2, $3, $4, $5)',
        [text, fromMe ? 'attendant' : 'customer', msg?.imageMessage ? 'image' : 'text', remoteJid, pushName]
      );

      // 3. Automated AI Response (if not from me)
      if (!fromMe) {
        console.log(`[Webhook] Message from ${pushName} (${remoteJid}): ${text}`);
        
        // 3.1 Fetch History
        const historyRes = await pool.query(
          'SELECT text, sender, type FROM messages WHERE remote_jid = $1 ORDER BY created_at DESC LIMIT 10',
          [remoteJid]
        );
        
        const chatHistory = historyRes.rows.reverse().map(m => ({
          role: (m.sender === 'ai' || m.sender === 'attendant') ? 'model' : 'user',
          parts: [{ text: m.text }]
        }));

        // 3.2 Get AI Response
        const aiResult = await handleAIChat(remoteJid, chatHistory, { name: pushName });
        
        // 3.3 Process Text Response
        if (aiResult.text) {
          const settings = await pool.query('SELECT key, value FROM settings WHERE key LIKE $1', ['evolution_%']);
          const config: any = {};
          settings.rows.forEach(r => config[r.key] = r.value);
          
          if (config.evolution_api_url && config.evolution_token && config.evolution_instance) {
             const evo = new EvolutionService({
               apiUrl: config.evolution_api_url,
               token: config.evolution_token,
               instance: config.evolution_instance
             });
             
             await evo.sendMessage(remoteJid, aiResult.text);
             
             // Save AI message to DB
             await pool.query(
               'INSERT INTO messages (text, sender, type, remote_jid, contact_name) VALUES ($1, $2, $3, $4, $5)',
               [aiResult.text, 'ai', 'text', remoteJid, pushName]
             );
          }
        }

        // 3.4 Process Tool Calls
        for (const call of aiResult.functionCalls) {
          if (call.name === 'generate_pix') {
             const { username, amount } = call.args as any;
             await handlePixGenerationTool(remoteJid, pushName, username, amount);
          } else if (call.name === 'get_customer_info') {
             const { username } = call.args as any;
             await handleCustomerInfoTool(remoteJid, pushName, username);
          }
        }
      }
      
    } catch (err: any) {
      console.error('[Webhook] Error processing evolution event:', err);
      try {
        await pool.query(
          'INSERT INTO messages (text, sender, type, remote_jid, contact_name) VALUES ($1, $2, $3, $4, $5)',
          [`⚠️ Erro Interno (Webhook): ${err.message}`, 'ai', 'text', remoteJid, pushName]
        );
      } catch (dbErr) {
        // Ignore DB error
      }
    }
  }
});

async function handlePixGenerationTool(remoteJid: string, pushName: string, username: string, amount: number) {
  try {
    const settings = await pool.query('SELECT key, value FROM settings WHERE key LIKE $1', ['evolution_%']);
    const config: any = {};
    settings.rows.forEach(r => config[r.key] = r.value);
    
    const evo = new EvolutionService({
      apiUrl: config.evolution_api_url,
      token: config.evolution_token,
      instance: config.evolution_instance
    });

    const pixKey = process.env.EFIBANK_PIX_KEY;
    if (!pixKey || pixKey === 'REPLACE_WITH_YOUR_PIX_KEY') {
       await evo.sendMessage(remoteJid, "⚠️ Desculpe, o sistema de Pix não está configurado no momento.");
       return;
    }

    const gn = getEfibankClient();
    const body = {
      calendario: { expiracao: 3600 },
      valor: { original: parseFloat(amount as any).toFixed(2) },
      chave: pixKey,
      solicitacaoPagador: `Renovação StartPainel - ${username}`
    };

    const response = await gn.pixCreateImmediateCharge({}, body);
    const qrcodeResponse = await gn.pixGenerateQRCode({ id: response.loc.id });
    
    await pool.query(
      'INSERT INTO pix_charges (txid, customer_username, amount) VALUES ($1, $2, $3)',
      [response.txid, username, amount]
    );

    await evo.sendMessage(remoteJid, `Gerando seu Pix de R$ ${amount}...`);
    // Send QR Code as Image
    await evo.sendMedia(remoteJid, qrcodeResponse.imagemQrcode, `Valor: R$ ${amount}\nCopia e Cola abaixo:`, 'pix.png');
    // Send Copia e Cola as text
    await evo.sendMessage(remoteJid, qrcodeResponse.qrcode);

    // Save to messages
    await pool.query(
      'INSERT INTO messages (text, sender, type, remote_jid, contact_name, metadata) VALUES ($1, $2, $3, $4, $5, $6)',
      [`Gerou Pix de R$ ${amount}`, 'ai', 'pix_qr', remoteJid, pushName, { txid: response.txid, copy_paste: qrcodeResponse.qrcode }]
    );

  } catch (error: any) {
    console.error('Tool Error (Pix):', error.message);
  }
}

async function handleCustomerInfoTool(remoteJid: string, pushName: string, username: string) {
  try {
     const settings = await pool.query('SELECT key, value FROM settings WHERE key LIKE $1', ['evolution_%']);
     const config: any = {};
     settings.rows.forEach(r => config[r.key] = r.value);
     
     const evo = new EvolutionService({
       apiUrl: config.evolution_api_url,
       token: config.evolution_token,
       instance: config.evolution_instance
     });

     const result = await pool.query(`
        SELECT c.*, 
               COALESCE(json_agg(a.*) FILTER (WHERE a.id IS NOT NULL), '[]') as apps
        FROM customers c
        LEFT JOIN customer_apps a ON c.id = a.customer_id
        WHERE c.username = $1
        GROUP BY c.id
      `, [username]);
      
      if (result.rows.length === 0) {
        await evo.sendMessage(remoteJid, `❌ Não encontrei nenhum cliente com o usuário "${username}".`);
        return;
      }

      const c = result.rows[0];
      let infoText = `✅ Dados de *${c.username}*:\n\n`;
      
      if (c.expiration_date) {
        const expDate = new Date(c.expiration_date).toLocaleDateString('pt-BR');
        infoText += `📅 *Vencimento:* ${expDate}\n\n`;
      }

      if (c.apps && c.apps.length > 0) {
        infoText += `📱 *Aplicativos:* \n`;
        c.apps.forEach((app: any) => {
          infoText += `\n*${app.app_name}* (${app.app_model})\n`;
          if (app.access_type === 'mac_key') {
            infoText += `• MAC: ${app.mac_address}\n• Key: ${app.device_key}\n`;
          } else {
            infoText += `• Usuário: ${app.username}\n• Senha: ${app.password}\n`;
            if (app.provider_url) infoText += `• Host: ${app.provider_url}\n`;
          }
        });
      }

      await evo.sendMessage(remoteJid, infoText);

      // Save to messages
      await pool.query(
        'INSERT INTO messages (text, sender, type, remote_jid, contact_name) VALUES ($1, $2, $3, $4, $5)',
        [infoText, 'ai', 'text', remoteJid, pushName]
      );

  } catch (error: any) {
    console.error('Tool Error (Info):', error.message);
  }
}

// --- VITE MIDDLEWARE ---

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true, 
        hmr: true,
        host: '0.0.0.0'
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Ensure API routes are checked before static files
    app.use(express.static(distPath, { index: false })); 
    
    // API Health Check
    app.get('/api/health', (req, res) => res.json({ status: 'ok', db: dbStatus }));

    app.get('*', (req, res) => {
      // If it looks like an API call but wasn't handled, return 404
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API route not found' });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log('\x1b[32m%s\x1b[0m', '------------------------------------------------');
    console.log('\x1b[32m%s\x1b[0m', `🚀 STARTPAINEL RODANDO!`);
    console.log('\x1b[32m%s\x1b[0m', `   Local:   http://localhost:${PORT}`);
    console.log('\x1b[32m%s\x1b[0m', `   Network: http://192.168.0.7:${PORT}`);
    console.log('\x1b[32m%s\x1b[0m', '------------------------------------------------');
  });
}

startServer();
