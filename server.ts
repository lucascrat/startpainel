import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();
import Gerencianet from 'gn-api-sdk-node';
import pkg from 'pg';
const { Pool } = pkg;
import { GoogleGenerativeAI } from "@google/generative-ai";
import { renewClientPuppeteer, createClientAndGetPlaylist, activateUltraPlayer } from './src/services/startpainel-puppeteer.js';
import { runIboPlayerAutomation } from './src/services/ibo-automation.js';
import { EvolutionService } from './src/services/evolution-api.js';
import { EdgeTTS } from '@andresaya/edge-tts';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database Connection Logic
const INTERNAL_DB = 'postgres://postgres:startpainel_db_pass_2024@tqvwnbzn0gdnkkhl211aaal5:5432/postgres';
const PUBLIC_DB = 'postgres://postgres:startpainel_db_pass_2024@84.247.138.242:5432/postgres';
const DB_URL = process.env.DATABASE_URL || INTERNAL_DB;

console.log('PG: Initializing connection pool...');
const pool = new Pool({
  connectionString: DB_URL,
  ssl: false,
  connectionTimeoutMillis: 5000,
  max: 20
});

pool.on('error', (err) => {
  console.error('PG: Unexpected database error:', err.message);
});

let dbStatus = 'connecting';
let dbError = '';

async function initDB(retries = 5) {
  let client;
  while (retries > 0) {
    try {
      client = await pool.connect();
      console.log('PG: Successfully connected to PostgreSQL');
      
      // Tables Creation (simplified for stability)
      const tables = [
        `CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, text TEXT, sender VARCHAR(20), type VARCHAR(50) DEFAULT 'text', remote_jid TEXT, contact_name TEXT, metadata JSONB, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS contacts (id SERIAL PRIMARY KEY, remote_jid TEXT UNIQUE NOT NULL, name TEXT, last_message TEXT, last_message_time TIMESTAMP, unread_count INTEGER DEFAULT 0, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS customers (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT, whatsapp TEXT, renewal_price DECIMAL(10,2) DEFAULT 49.90, expiration_date DATE, playlist_url TEXT, status TEXT DEFAULT 'active', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS ai_usage_logs (id SERIAL PRIMARY KEY, model TEXT NOT NULL, type TEXT NOT NULL, prompt_tokens INTEGER, candidates_tokens INTEGER, estimated_cost DECIMAL(15,8), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS customer_apps (id SERIAL PRIMARY KEY, customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE, app_name TEXT NOT NULL, app_model TEXT, access_type TEXT, mac_address TEXT, device_key TEXT, username TEXT, password TEXT, provider_url TEXT, is_tv BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS pix_charges (txid TEXT PRIMARY KEY, customer_username TEXT, amount DECIMAL(10,2), status TEXT DEFAULT 'ATIVA', processed BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS settings (key VARCHAR(255) PRIMARY KEY, value TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
      ];

      for (const sql of tables) await client.query(sql);
      
      dbStatus = 'connected';
      return;
    } catch (err: any) {
      console.error(`PG: Connection attempt failed. Retries left: ${retries - 1}`, err.message);
      dbError = err.message;
      retries--;
      if (retries > 0) await new Promise(r => setTimeout(r, 2000));
    } finally {
      if (client) client.release();
    }
  }
  dbStatus = 'error';
  console.error('PG: Could not connect to database after multiple attempts.');
}

initDB();

const app = express();
app.use(express.json({ limit: '50mb' }));
const PORT = process.env.PORT || 3000;

// --- AI HELPERS ---
async function handleAIChat(remoteJid: string, history: any[], userInfo: any, media?: { data: string, mimeType: string }) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not defined");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const contents: any[] = [
      { role: 'user', parts: [{ text: "Você é o assistente oficial do StartPainel. Ajude os clientes a renovar, consultar vencimento e configurar apps." }] },
      ...history
    ];

    if (media) {
      const last = contents[contents.length - 1];
      last.parts.push({ inlineData: { data: media.data, mimeType: media.mimeType } });
    }

    const result = await model.generateContent({
      contents,
      tools: [{
        functionDeclarations: [
          { name: "generate_pix", description: "Gera um QR Code Pix.", parameters: { type: "object", properties: { username: { type: "string" }, amount: { type: "number" } }, required: ["username", "amount"] } },
          { name: "get_customer_info", description: "Consulta dados do cliente.", parameters: { type: "object", properties: { username: { type: "string" } }, required: ["username"] } },
          { name: "save_customer_app", description: "Salva dados de um app.", parameters: { type: "object", properties: { username: { type: "string" }, appName: { type: "string" } }, required: ["username", "appName"] } }
        ]
      }]
    });

    const response = result.response;
    return { text: response.text() || '', functionCalls: response.functionCalls() || [], usage: response.usageMetadata, model: 'gemini-2.5-flash' };
  } catch (error: any) {
    return { text: `⚠️ IA Erro: ${error.message}`, functionCalls: [], model: 'gemini-2.5-flash' };
  }
}

// --- EFIBANK HELPER ---
function getEfibankClient() {
  const options = {
    client_id: process.env.EFIBANK_CLIENT_ID,
    client_secret: process.env.EFIBANK_CLIENT_SECRET,
    sandbox: process.env.EFIBANK_SANDBOX === 'true',
    certificate: path.join(process.cwd(), 'certs/efibank_cert.p12')
  };
  if (process.env.EFIBANK_CERT_PATH) {
     if (!fs.existsSync(path.join(process.cwd(), 'certs'))) fs.mkdirSync(path.join(process.cwd(), 'certs'));
     fs.writeFileSync(options.certificate, Buffer.from(process.env.EFIBANK_CERT_PATH, 'base64'));
  }
  return new Gerencianet(options);
}

// --- API ROUTES ---

// Health
app.get('/api/health', (req, res) => {
  res.json({ 
    status: dbStatus === 'connected' ? 'ok' : 'error', 
    db: dbStatus, 
    details: dbError || 'No errors reported'
  });
});

// Auth Login
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const adminPass = process.env.ADMIN_PASSWORD || 'admin2026';
  
  console.log(`[Auth] Tentativa de login recebida. Senha enviada: ${password ? '***' : 'vazia'}`);

  if (password === adminPass) {
    console.log('[Auth] Login bem-sucedido!');
    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '24h' });
    return res.json({ success: true, token });
  }
  
  console.log('[Auth] Senha incorreta ou admin não configurado.');
  res.status(401).json({ error: 'Senha incorreta' });
});

// Customers
app.get('/api/customers', async (req, res) => {
  const result = await pool.query('SELECT * FROM customers ORDER BY created_at DESC');
  res.json(result.rows);
});

app.post('/api/customers', async (req, res) => {
  const { username, name, whatsapp, renewal_price, expiration_date, playlist_url } = req.body;
  const result = await pool.query('INSERT INTO customers (username, name, whatsapp, renewal_price, expiration_date, playlist_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [username, name, whatsapp, renewal_price || 49.90, expiration_date, playlist_url]);
  res.json(result.rows[0]);
});

app.put('/api/customers/:id', async (req, res) => {
  const { id } = req.params;
  const { username, name, whatsapp, renewal_price, expiration_date, playlist_url, status } = req.body;
  const result = await pool.query('UPDATE customers SET username=$1, name=$2, whatsapp=$3, renewal_price=$4, expiration_date=$5, playlist_url=$6, status=$7, updated_at=NOW() WHERE id=$8 RETURNING *', [username, name, whatsapp, renewal_price, expiration_date, playlist_url, status, id]);
  res.json(result.rows[0]);
});

app.delete('/api/customers/:id', async (req, res) => {
  await pool.query('DELETE FROM customers WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

// Settings
app.get('/api/settings', async (req, res) => {
  const result = await pool.query('SELECT * FROM settings');
  res.json(result.rows);
});

app.post('/api/settings', async (req, res) => {
  const { key, value } = req.body;
  await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()', [key, value]);
  res.json({ success: true });
});

// Messages & Contacts
app.get('/api/contacts', async (req, res) => {
  const result = await pool.query('SELECT * FROM contacts ORDER BY last_message_time DESC');
  res.json(result.rows);
});

app.get('/api/messages/:remoteJid', async (req, res) => {
  const result = await pool.query('SELECT * FROM messages WHERE remote_jid = $1 ORDER BY created_at ASC LIMIT 100', [req.params.remoteJid]);
  res.json(result.rows);
});

// Pix Generation
app.post('/api/pix/generate', async (req, res) => {
  try {
    const { username, amount } = req.body;
    const gn = getEfibankClient();
    const pixKey = process.env.EFIBANK_PIX_KEY;
    const body = { calendario: { expiracao: 3600 }, valor: { original: parseFloat(amount).toFixed(2) }, chave: pixKey, solicitacaoPagador: `Renovação - ${username}` };
    const response = await gn.pixCreateImmediateCharge({}, body);
    const qrcode = await gn.pixGenerateQRCode({ id: response.loc.id });
    await pool.query('INSERT INTO pix_charges (txid, customer_username, amount) VALUES ($1, $2, $3)', [response.txid, username, amount]);
    res.json({ qrcode_image: qrcode.imagemQrcode, copy_paste: qrcode.qrcode, txid: response.txid });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Automations
app.get('/api/automations', async (req, res) => {
  const result = await pool.query('SELECT * FROM automations ORDER BY created_at DESC');
  res.json(result.rows);
});

app.post('/api/automations', async (req, res) => {
  const { name, siteUrl, username, password, type } = req.body;
  const result = await pool.query('INSERT INTO automations (name, site_url, username, password, type) VALUES ($1, $2, $3, $4, $5) RETURNING *', [name, siteUrl, username, password, type]);
  res.json(result.rows[0]);
});

// Manual Run Routes
app.post('/api/panel/extend', async (req, res) => {
  try {
    const { username } = req.body;
    const result = await renewClientPuppeteer(username);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/automations/ibo/run', async (req, res) => {
  try {
    const { mac, key, playlistUrl, targetUrl } = req.body;
    const geminiKeyRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['gemini_api_key']);
    const result = await runIboPlayerAutomation(mac, key, playlistUrl, geminiKeyRes.rows[0]?.value, targetUrl);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/automations/startpainel/create-client', async (req, res) => {
  try {
    const { username } = req.body;
    const result = await createClientAndGetPlaylist(username);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/automations/startpainel/activate-ultra', async (req, res) => {
  try {
    const { username, mac } = req.body;
    const result = await activateUltraPlayer(username, mac);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// AI Usage Stats
app.get('/api/ai-usage', async (req, res) => {
  const stats = await pool.query('SELECT COUNT(*) as total_requests, SUM(prompt_tokens) as total_prompt_tokens, SUM(candidates_tokens) as total_candidates_tokens, SUM(estimated_cost) as total_estimated_cost FROM ai_usage_logs');
  const recent = await pool.query('SELECT * FROM ai_usage_logs ORDER BY created_at DESC LIMIT 10');
  res.json({ summary: stats.rows[0], recent: recent.rows });
});

// Evolution Webhook
app.post('/api/webhooks/evolution', async (req, res) => {
  let remoteJid = '';
  let pushName = 'Cliente';
  try {
    const data = req.body;
    res.status(200).send('OK');
    if (data.event !== 'messages.upsert') return;
    const msg = data.data.message;
    remoteJid = data.data.key.remoteJid;
    if (data.data.key.fromMe) return;
    pushName = data.data.pushName || (remoteJid ? remoteJid.split('@')[0] : 'Cliente');

    let text = msg?.conversation || msg?.extendedTextMessage?.text || msg?.imageMessage?.caption || msg?.videoMessage?.caption || msg?.message?.conversation || '';
    if (!text && !msg?.imageMessage && !msg?.audioMessage) return;

    await pool.query('INSERT INTO contacts (remote_jid, name, last_message, last_message_time, updated_at) VALUES ($1, $2, $3, NOW(), NOW()) ON CONFLICT (remote_jid) DO UPDATE SET name=EXCLUDED.name, last_message=EXCLUDED.last_message, last_message_time=NOW(), updated_at=NOW()', [remoteJid, pushName, text || '[Mídia]']);
    await pool.query('INSERT INTO messages (text, sender, type, remote_jid, contact_name) VALUES ($1, $2, $3, $4, $5)', [text || '[Mídia]', 'customer', 'text', remoteJid, pushName]);

    const historyRes = await pool.query('SELECT text, sender FROM messages WHERE remote_jid = $1 ORDER BY created_at DESC LIMIT 10', [remoteJid]);
    const chatHistory = historyRes.rows.reverse().map(m => ({ role: (m.sender === 'ai' || m.sender === 'attendant') ? 'model' : 'user', parts: [{ text: m.text || '[Mídia]' }] }));

    let mediaData = undefined;
    if (msg?.imageMessage || msg?.audioMessage) {
       try {
         const settings = await pool.query('SELECT key, value FROM settings WHERE key LIKE $1', ['evolution_%']);
         const config: any = {}; settings.rows.forEach(r => config[r.key] = r.value);
         const evo = new EvolutionService({ apiUrl: config.evolution_api_url, token: config.evolution_token, instance: config.evolution_instance });
         const media = await evo.loadMedia(data.data.key);
         if (media?.base64) mediaData = { data: media.base64.replace(/^data:.*?;base64,/, ""), mimeType: msg.imageMessage ? 'image/png' : 'audio/ogg' };
       } catch (e) {}
    }

    const aiResult = await handleAIChat(remoteJid, chatHistory, { name: pushName }, mediaData);
    if (aiResult.text) {
       const settings = await pool.query('SELECT key, value FROM settings WHERE key LIKE $1', ['evolution_%']);
       const config: any = {}; settings.rows.forEach(r => config[r.key] = r.value);
       const evo = new EvolutionService({ apiUrl: config.evolution_api_url, token: config.evolution_token, instance: config.evolution_instance });
       
       if (msg?.audioMessage || Math.random() > 0.7) {
         try {
           const tts = new EdgeTTS();
           const buffer = await tts.tts(aiResult.text, { voice: 'pt-BR-AntonioNeural' });
           await evo.sendAudio(remoteJid, `data:audio/mp3;base64,${buffer.toString('base64')}`);
         } catch (e) { await evo.sendMessage(remoteJid, aiResult.text); }
       } else { await evo.sendMessage(remoteJid, aiResult.text); }

       await pool.query('INSERT INTO messages (text, sender, type, remote_jid, contact_name) VALUES ($1, $2, $3, $4, $5)', [aiResult.text, 'ai', 'text', remoteJid, pushName]);
    }

    for (const call of aiResult.functionCalls) {
      if (call.name === 'generate_pix') await handlePixGenerationTool(remoteJid, pushName, call.args.username, call.args.amount);
    }
  } catch (err: any) { console.error('[Webhook Error]', err); }
});

async function handlePixGenerationTool(remoteJid: string, pushName: string, username: string, amount: number) {
  try {
    const gn = getEfibankClient();
    const pixKey = process.env.EFIBANK_PIX_KEY;
    const body = { calendario: { expiracao: 3600 }, valor: { original: parseFloat(amount as any).toFixed(2) }, chave: pixKey, solicitacaoPagador: `Renovação - ${username}` };
    const response = await gn.pixCreateImmediateCharge({}, body);
    const qrcode = await gn.pixGenerateQRCode({ id: response.loc.id });
    const settings = await pool.query('SELECT key, value FROM settings WHERE key LIKE $1', ['evolution_%']);
    const config: any = {}; settings.rows.forEach(r => config[r.key] = r.value);
    const evo = new EvolutionService({ apiUrl: config.evolution_api_url, token: config.evolution_token, instance: config.evolution_instance });
    await evo.sendMedia(remoteJid, qrcode.imagemQrcode, `Copia e Cola: ${qrcode.qrcode}`, 'pix.png');
  } catch (e) {}
}

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true, hmr: true, host: '0.0.0.0' }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false }));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`));
}
startServer();
