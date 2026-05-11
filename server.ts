import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();
import Gerencianet from 'gn-api-sdk-node';
import pkg from 'pg';
const { Pool } = pkg;
import { GoogleGenerativeAI } from "@google/generative-ai";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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
        `CREATE TABLE IF NOT EXISTS payment_receipts (
          id SERIAL PRIMARY KEY,
          customer_username TEXT,
          customer_id INTEGER,
          payer_name TEXT,
          amount DECIMAL(10,2),
          paid_at TIMESTAMP,
          remote_jid TEXT,
          image_data TEXT,
          status TEXT DEFAULT 'pending_review',
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          reviewed_at TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS customer_apps (id SERIAL PRIMARY KEY, customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE, app_name TEXT NOT NULL, app_model TEXT, access_type TEXT, mac_address TEXT, device_key TEXT, username TEXT, password TEXT, provider_url TEXT, is_tv BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS pix_charges (txid TEXT PRIMARY KEY, customer_username TEXT, amount DECIMAL(10,2), status TEXT DEFAULT 'ATIVA', processed BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS settings (key VARCHAR(255) PRIMARY KEY, value TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
      ];

      for (const sql of tables) await client.query(sql);

      // Idempotent column additions (CREATE TABLE IF NOT EXISTS doesn't add new columns to existing tables)
      const alters = [
        `ALTER TABLE customer_apps ADD COLUMN IF NOT EXISTS android_link TEXT`,
        `ALTER TABLE customer_apps ADD COLUMN IF NOT EXISTS ios_link TEXT`,
        `ALTER TABLE customer_apps ADD COLUMN IF NOT EXISTS icon_url TEXT`,
        `ALTER TABLE customer_apps ADD COLUMN IF NOT EXISTS app_site_url TEXT`,
      ];
      for (const sql of alters) {
        try { await client.query(sql); } catch (e: any) { console.warn('PG: alter falhou:', e.message); }
      }

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

// Global Logger
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.url}`);
  next();
});

const PORT = process.env.PORT || 3000;

// --- ADMIN AUTH ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || crypto.randomBytes(48).toString('hex');
if (!process.env.ADMIN_JWT_SECRET) {
  console.warn('AUTH: ADMIN_JWT_SECRET ausente — usando segredo efêmero (tokens invalidam ao reiniciar).');
}
if (!ADMIN_PASSWORD) {
  console.warn('AUTH: ADMIN_PASSWORD ausente — login admin desativado.');
}

const PUBLIC_SETTING_KEYS = new Set(['attendant_name', 'attendant_image']);
const SENSITIVE_SETTING_KEYS = new Set(['gemini_api_key']);

function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function verifyAdminToken(req: express.Request): boolean {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return false;
  try {
    jwt.verify(auth.slice(7), ADMIN_JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!verifyAdminToken(req)) {
    return res.status(401).json({ error: 'Acesso negado' });
  }
  next();
}

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'Login admin não configurado no servidor' });
  }
  if (typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ error: 'Senha obrigatória' });
  }
  const a = Buffer.from(password);
  const b = Buffer.from(ADMIN_PASSWORD);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) {
    return res.status(401).json({ error: 'Senha incorreta' });
  }
  const token = jwt.sign({ role: 'admin' }, ADMIN_JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, expiresIn: 12 * 60 * 60 });
});

app.get('/api/admin/me', (req, res) => {
  res.json({ authenticated: verifyAdminToken(req) });
});

// --- R2 STORAGE ---
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || '').replace(/\/$/, '');
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

const r2Configured = !!(R2_ACCOUNT_ID && R2_BUCKET && R2_PUBLIC_BASE && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
if (!r2Configured) {
  console.warn('R2: variaveis ausentes (R2_ACCOUNT_ID/R2_BUCKET/R2_PUBLIC_BASE/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY) — uploads cairao no fallback base64.');
}

const r2Client = r2Configured ? new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID!, secretAccessKey: R2_SECRET_ACCESS_KEY! },
}) : null;

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/svg+xml': 'svg', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
  'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'weba',
};

async function uploadToR2(prefix: string, base64: string, mimeType: string): Promise<string | null> {
  if (!r2Client) return null;
  try {
    const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const ext = MIME_TO_EXT[mimeType.toLowerCase()] || 'bin';
    const key = `${prefix.replace(/\/$/, '')}/${crypto.randomUUID()}.${ext}`;
    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    return `${R2_PUBLIC_BASE}/${key}`;
  } catch (e: any) {
    console.error('[R2] upload falhou:', e?.message || e);
    return null;
  }
}

// --- AI USAGE LOGGING ---
// Preços por 1M tokens (USD). Atualizar conforme tabela oficial do Gemini.
const GEMINI_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash':              { input: 0.075,  output: 0.30 },
  'gemini-2.5-flash-preview-tts':  { input: 0.075,  output: 0.30 },
  'gemini-2.5-pro':                { input: 1.25,   output: 5.00 },
  'gemini-2.5-pro-preview-tts':    { input: 1.25,   output: 5.00 },
};

async function logAiUsage(model: string, type: string, usage: any) {
  try {
    const promptTokens = Number(usage?.promptTokenCount || 0);
    const candidatesTokens = Number(usage?.candidatesTokenCount || 0);
    const pricing = GEMINI_PRICING[model] || { input: 0.075, output: 0.30 };
    const cost = (promptTokens * pricing.input + candidatesTokens * pricing.output) / 1_000_000;
    await pool.query(
      'INSERT INTO ai_usage_logs (model, type, prompt_tokens, candidates_tokens, estimated_cost) VALUES ($1, $2, $3, $4, $5)',
      [model, type, promptTokens, candidatesTokens, cost.toFixed(8)]
    );
  } catch (e: any) {
    console.error('[AI Usage] log falhou:', e?.message || e);
  }
}

// --- TTS HELPERS ---
// Gemini 2.5 Flash Preview TTS é mais natural mas pago; EdgeTTS é fallback grátis.
// Para economizar: só vira áudio quando a resposta é curta OU o cliente mandou áudio.
const TTS_AUDIO_MAX_CHARS = 220;
const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const GEMINI_TTS_VOICE = process.env.GEMINI_TTS_VOICE || 'Kore';

function pcmToWav(pcm: Buffer, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

async function generateGeminiTTS(text: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || !text?.trim()) return null;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: GEMINI_TTS_MODEL,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_TTS_VOICE } },
        },
      } as any,
    });
    const result = await model.generateContent(text);
    await logAiUsage(GEMINI_TTS_MODEL, 'tts', result.response.usageMetadata);
    const part: any = result.response.candidates?.[0]?.content?.parts?.[0];
    const data: string | undefined = part?.inlineData?.data;
    if (!data) {
      console.warn('[GeminiTTS] resposta sem inlineData');
      return null;
    }
    // Gemini retorna PCM 16-bit mono 24kHz. Embrulha em WAV pra navegador/Evolution tocarem.
    const pcm = Buffer.from(data, 'base64');
    const wav = pcmToWav(pcm, 24000, 1, 16);
    return { base64: wav.toString('base64'), mimeType: 'audio/wav' };
  } catch (e: any) {
    console.error('[GeminiTTS] erro:', e?.message || e);
    return null;
  }
}

async function generateEdgeTTS(text: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    if (!text?.trim()) return null;
    const tts = new EdgeTTS();
    const buffer = await tts.tts(text, { voice: 'pt-BR-AntonioNeural' });
    return { base64: buffer.toString('base64'), mimeType: 'audio/mp3' };
  } catch (e: any) {
    console.error('[EdgeTTS] erro:', e?.message || e);
    return null;
  }
}

// Tenta Gemini primeiro (mais natural), cai pra EdgeTTS (grátis) se falhar.
async function generateAudio(text: string): Promise<{ base64: string; mimeType: string } | null> {
  return (await generateGeminiTTS(text)) || (await generateEdgeTTS(text));
}

// --- AI HELPERS ---
async function handleAIChat(remoteJid: string, history: any[], userInfo: any, media?: { data: string, mimeType: string }) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not defined");
    const GEMINI_MODEL = 'gemini-2.5-flash';
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const systemPrompt = `Você é a atendente oficial do StartPainel. Ajude os clientes a renovar, consultar vencimento e configurar apps.

Você é multimodal:
- ENTENDE: texto, áudio e imagens.
- RESPONDE: o sistema converte automaticamente sua resposta em áudio quando ela é curta (até 220 caracteres) ou quando o cliente enviou áudio. Você NUNCA precisa avisar que "não pode mandar áudio" — pode sim, é automático. Apenas escreva sua resposta normalmente; se ficar curta, vai virar áudio sozinha.

Regras de resposta:
- Quando receber áudio, transcreva mentalmente e responda ao conteúdo falado.
- Quando receber imagem, analise o que está mostrando.
- Se a imagem for um COMPROVANTE DE PIX (tem valor em R$, data, hora, nome do pagador, banco), extraia os dados e use a tool 'register_pix_receipt' com payer_name (quem pagou), amount (valor numérico), paid_at (data e hora no formato ISO 8601 'YYYY-MM-DDTHH:mm:ss'). Após registrar, responda confirmando o recebimento e a renovação do plano.
- Se a imagem NÃO for comprovante (print de erro, foto do app, etc.), apenas analise normalmente.
- Se o cliente pedir explicitamente uma resposta em áudio, apenas mantenha a resposta curta (frase única) e ela já virá em áudio.
- Sempre responda em português, estilo WhatsApp: breve, claro, com emojis quando apropriado.`;

    const contents: any[] = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Entendido! Pronta para ajudar. 😊' }] },
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
          { name: "generate_pix", description: "Gera um QR Code Pix.", parameters: { type: "OBJECT", properties: { username: { type: "STRING" }, amount: { type: "NUMBER" } }, required: ["username", "amount"] } },
          { name: "get_customer_info", description: "Consulta dados do cliente.", parameters: { type: "OBJECT", properties: { username: { type: "STRING" } }, required: ["username"] } },
          { name: "save_customer_app", description: "Salva dados de um app.", parameters: { type: "OBJECT", properties: { username: { type: "STRING" }, appName: { type: "STRING" } }, required: ["username", "appName"] } },
          { name: "register_pix_receipt", description: "Registra um comprovante de Pix recebido em imagem. Use APENAS quando o cliente envia uma foto/print de comprovante de pagamento Pix. Após chamar, o sistema renova automaticamente o plano do cliente.", parameters: { type: "OBJECT", properties: { payer_name: { type: "STRING", description: "Nome de quem pagou (aparece como 'Pagador' ou 'Origem' no comprovante)." }, amount: { type: "NUMBER", description: "Valor pago em reais (apenas o número, ex: 49.90)." }, paid_at: { type: "STRING", description: "Data e hora do pagamento no formato ISO 8601 YYYY-MM-DDTHH:mm:ss." } }, required: ["payer_name", "amount", "paid_at"] } }
        ]
      }] as any
    });

    const response = result.response;
    await logAiUsage(GEMINI_MODEL, 'chat', response.usageMetadata);
    return { text: response.text() || '', functionCalls: response.functionCalls() || [], usage: response.usageMetadata, model: GEMINI_MODEL };
  } catch (error: any) {
    console.error('[AI Error]', error.message);
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

// Health / DB Status
app.get('/api/health', (req, res) => {
  res.json({ status: dbStatus === 'connected' ? 'ok' : 'error', db: dbStatus, details: dbError });
});

app.get('/api/db-status', (req, res) => {
  res.json({ status: dbStatus, error: dbError });
});

// (rota /api/ai-usage definida abaixo — esta duplicata foi removida)

// --- UPLOAD para R2 (admin only) ---
app.post('/api/upload', requireAdmin, async (req, res) => {
  try {
    const { data, mimeType, prefix } = req.body || {};
    if (!data || !mimeType) {
      return res.status(400).json({ error: 'data (base64) e mimeType são obrigatórios' });
    }
    console.log(`[Upload] prefix=${prefix} mime=${mimeType} bytes=${Math.round(String(data).length * 3 / 4 / 1024)}KB r2=${r2Configured}`);
    if (!r2Configured) {
      const cleanBase64 = String(data).replace(/^data:[^;]+;base64,/, '');
      return res.json({ url: `data:${mimeType};base64,${cleanBase64}`, storage: 'inline' });
    }
    const url = await uploadToR2(prefix || 'misc', data, mimeType);
    if (!url) return res.status(500).json({ error: 'Falha ao subir para R2 (ver logs do servidor)' });
    console.log(`[Upload] OK: ${url}`);
    res.json({ url, storage: 'r2' });
  } catch (e: any) {
    console.error('[Upload] erro:', e?.message || e);
    res.status(500).json({ error: e.message });
  }
});

// Diagnostico rapido — admin only
app.get('/api/upload/status', requireAdmin, (req, res) => {
  res.json({
    r2Configured,
    R2_ACCOUNT_ID: R2_ACCOUNT_ID ? `${R2_ACCOUNT_ID.slice(0, 8)}...` : null,
    R2_BUCKET: R2_BUCKET || null,
    R2_PUBLIC_BASE: R2_PUBLIC_BASE || null,
    R2_ACCESS_KEY_ID: R2_ACCESS_KEY_ID ? `${R2_ACCESS_KEY_ID.slice(0, 4)}...` : null,
    R2_SECRET_ACCESS_KEY_present: !!R2_SECRET_ACCESS_KEY,
  });
});

// --- PAYMENT RECEIPTS (admin only) ---
app.get('/api/payment-receipts', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, customer_username, customer_id, payer_name, amount, paid_at, remote_jid,
              image_data, status, notes, created_at, reviewed_at
       FROM payment_receipts ORDER BY created_at DESC LIMIT 200`
    );
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/payment-receipts/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body || {};
    const allowedStatus = ['pending_review', 'approved', 'rejected', 'refunded'];
    if (status && !allowedStatus.includes(status)) {
      return res.status(400).json({ error: `status invalido. Use: ${allowedStatus.join(', ')}` });
    }
    const result = await pool.query(
      `UPDATE payment_receipts
       SET status = COALESCE($2, status),
           notes  = COALESCE($3, notes),
           reviewed_at = CASE WHEN $2 IS NOT NULL THEN NOW() ELSE reviewed_at END
       WHERE id = $1 RETURNING *`,
      [id, status || null, notes || null]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Comprovante nao encontrado' });
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/payment-receipts/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM payment_receipts WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Financials
app.get('/api/financials', async (req, res) => {
  try {
    const totalCustomers = await pool.query('SELECT COUNT(*) FROM customers');
    const activeCustomers = await pool.query("SELECT COUNT(*) FROM customers WHERE status = 'active'");
    const monthlyRevenue = await pool.query('SELECT SUM(renewal_price) FROM customers');
    res.json({
      total_customers: parseInt(totalCustomers.rows[0].count),
      active_customers: parseInt(activeCustomers.rows[0].count),
      monthly_revenue: parseFloat(monthlyRevenue.rows[0].sum || 0)
    });
  } catch (e) { res.json({ error: e.message }); }
});

// Auth Login
app.post('/api/admin/login', (req, res) => {
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

// Single customer com apps embutidos
app.get('/api/customers/:id', async (req, res) => {
  try {
    const cust = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (!cust.rows[0]) return res.status(404).json({ error: 'Cliente nao encontrado' });
    const apps = await pool.query('SELECT * FROM customer_apps WHERE customer_id = $1 ORDER BY created_at DESC', [req.params.id]);
    res.json({ ...cust.rows[0], apps: apps.rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Apps de cliente: aceita payload tanto em camelCase (form de criacao) quanto snake_case (edicao).
function normalizeAppPayload(b: any) {
  return {
    app_name:     b.app_name     ?? b.appName     ?? null,
    app_model:    b.app_model    ?? b.appModel    ?? null,
    access_type:  b.access_type  ?? b.accessType  ?? 'mac_key',
    mac_address:  b.mac_address  ?? b.macAddress  ?? null,
    device_key:   b.device_key   ?? b.deviceKey   ?? null,
    username:     b.username     ?? b.appUsername ?? null,
    password:     b.password     ?? b.appPassword ?? null,
    provider_url: b.provider_url ?? b.providerUrl ?? null,
    android_link: b.android_link ?? b.androidLink ?? null,
    ios_link:     b.ios_link     ?? b.iosLink     ?? null,
    icon_url:     b.icon_url     ?? b.iconUrl     ?? null,
    app_site_url: b.app_site_url ?? b.appSiteUrl  ?? null,
    is_tv:        b.is_tv        ?? b.isTv        ?? true,
  };
}

app.post('/api/customers/:id/apps', async (req, res) => {
  try {
    const a = normalizeAppPayload(req.body || {});
    if (!a.app_name) return res.status(400).json({ error: 'app_name é obrigatório' });
    const result = await pool.query(
      `INSERT INTO customer_apps (customer_id, app_name, app_model, access_type, mac_address, device_key, username, password, provider_url, android_link, ios_link, icon_url, app_site_url, is_tv)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [req.params.id, a.app_name, a.app_model, a.access_type, a.mac_address, a.device_key, a.username, a.password, a.provider_url, a.android_link, a.ios_link, a.icon_url, a.app_site_url, a.is_tv]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.put('/api/apps/:id', async (req, res) => {
  try {
    const a = normalizeAppPayload(req.body || {});
    const result = await pool.query(
      `UPDATE customer_apps SET app_name=$2, app_model=$3, access_type=$4, mac_address=$5, device_key=$6, username=$7, password=$8, provider_url=$9, android_link=$10, ios_link=$11, icon_url=$12, app_site_url=$13, is_tv=$14
       WHERE id=$1 RETURNING *`,
      [req.params.id, a.app_name, a.app_model, a.access_type, a.mac_address, a.device_key, a.username, a.password, a.provider_url, a.android_link, a.ios_link, a.icon_url, a.app_site_url, a.is_tv]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'App nao encontrado' });
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/apps/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM customer_apps WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Settings
app.get('/api/settings', requireAdmin, async (req, res) => {
  // Returns all settings — sensitive keys come masked.
  const result = await pool.query('SELECT key, value FROM settings');
  const rows = result.rows.map(r => SENSITIVE_SETTING_KEYS.has(r.key)
    ? { key: r.key, configured: !!r.value, masked: maskSecret(r.value) }
    : { key: r.key, value: r.value });
  res.json(rows);
});

app.get('/api/settings/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const isPublic = PUBLIC_SETTING_KEYS.has(key);
    const isSensitive = SENSITIVE_SETTING_KEYS.has(key);
    if (!isPublic && !verifyAdminToken(req)) {
      return res.status(401).json({ error: 'Acesso negado' });
    }
    const result = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    const value = result.rows[0]?.value ?? null;
    if (isSensitive) {
      return res.json({ configured: !!value, masked: maskSecret(value) });
    }
    res.json({ value });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/settings', requireAdmin, async (req, res) => {
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

// Public Chat (visitor-facing widget on the website)
// Sessions are identified by a client-generated UUID stored in localStorage.
// All messages are persisted with remote_jid = `web:${sessionId}@public` so
// the admin Multi-Chat can also see/answer them.
app.post('/api/public-chat', async (req, res) => {
  try {
    const { sessionId, name, message } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string' || !message || typeof message !== 'string') {
      return res.status(400).json({ error: 'sessionId e message são obrigatórios' });
    }
    const remoteJid = `web:${sessionId}@public`;
    const visitorName = (typeof name === 'string' && name.trim()) ? name.trim() : 'Visitante';

    await pool.query(
      'INSERT INTO contacts (remote_jid, name, last_message, last_message_time, updated_at) VALUES ($1, $2, $3, NOW(), NOW()) ON CONFLICT (remote_jid) DO UPDATE SET name=EXCLUDED.name, last_message=EXCLUDED.last_message, last_message_time=NOW(), updated_at=NOW()',
      [remoteJid, visitorName, message]
    );
    await pool.query(
      'INSERT INTO messages (text, sender, type, remote_jid, contact_name) VALUES ($1, $2, $3, $4, $5)',
      [message, 'customer', 'text', remoteJid, visitorName]
    );

    const historyRes = await pool.query(
      'SELECT text, sender FROM messages WHERE remote_jid = $1 ORDER BY created_at DESC LIMIT 10',
      [remoteJid]
    );
    const chatHistory = historyRes.rows.reverse().map((m: any) => ({
      role: (m.sender === 'ai' || m.sender === 'attendant') ? 'model' : 'user',
      parts: [{ text: m.text || '' }]
    }));

    const aiResult = await handleAIChat(remoteJid, chatHistory, { name: visitorName });
    const replyText = aiResult.text || '⚠️ Sem resposta da IA';

    await pool.query(
      'INSERT INTO messages (text, sender, type, remote_jid, contact_name) VALUES ($1, $2, $3, $4, $5)',
      [replyText, 'ai', 'text', remoteJid, visitorName]
    );

    // Áudio só pra respostas curtas (economia + humanização).
    let audio: { data: string; mimeType: string } | null = null;
    if (replyText.length <= TTS_AUDIO_MAX_CHARS && !replyText.startsWith('⚠️')) {
      const generated = await generateAudio(replyText);
      if (generated) audio = { data: generated.base64, mimeType: generated.mimeType };
    }

    res.json({ text: replyText, audio });
  } catch (e: any) {
    console.error('[PublicChat Error]', e?.message || e);
    res.status(500).json({ error: e?.message || 'Erro interno' });
  }
});

// Evolution Webhook — accepts both single-URL and "by-events" modes:
//   POST /api/webhooks/evolution                  (single URL, body has data.event)
//   POST /api/webhooks/evolution/messages-upsert  (by-events mode, event in URL suffix)
app.post('/api/webhooks/evolution/:event?', async (req, res) => {
  let remoteJid = '';
  let pushName = 'Cliente';
  try {
    const data = req.body;
    res.status(200).send('OK');
    const eventName = (req.params.event || data.event || '').toString().replace(/-/g, '.');
    if (eventName !== 'messages.upsert') return;
    const msg = data.data.message;
    remoteJid = data.data.key.remoteJid;
    if (data.data.key.fromMe) return;
    pushName = data.data.pushName || (remoteJid ? remoteJid.split('@')[0] : 'Cliente');
    console.log(`[Webhook] Mensagem recebida de ${pushName} (${remoteJid})`);

    let text = msg?.conversation || msg?.extendedTextMessage?.text || msg?.imageMessage?.caption || msg?.videoMessage?.caption || msg?.message?.conversation || '';
    const isImage = !!msg?.imageMessage;
    const isAudio = !!msg?.audioMessage;
    if (!text && !isImage && !isAudio) return;

    // Visible placeholder for media-only messages so the AI knows what to expect.
    const storedText = text || (isImage ? '[Imagem enviada]' : isAudio ? '[Áudio enviado]' : '[Mídia]');

    await pool.query('INSERT INTO contacts (remote_jid, name, last_message, last_message_time, updated_at) VALUES ($1, $2, $3, NOW(), NOW()) ON CONFLICT (remote_jid) DO UPDATE SET name=EXCLUDED.name, last_message=EXCLUDED.last_message, last_message_time=NOW(), updated_at=NOW()', [remoteJid, pushName, storedText]);
    await pool.query('INSERT INTO messages (text, sender, type, remote_jid, contact_name) VALUES ($1, $2, $3, $4, $5)', [storedText, 'customer', isImage ? 'image' : isAudio ? 'audio' : 'text', remoteJid, pushName]);

    const historyRes = await pool.query('SELECT text, sender FROM messages WHERE remote_jid = $1 ORDER BY created_at DESC LIMIT 10', [remoteJid]);
    const chatHistory = historyRes.rows.reverse().map(m => ({ role: (m.sender === 'ai' || m.sender === 'attendant') ? 'model' : 'user', parts: [{ text: m.text || '[Mídia]' }] }));

    let mediaData = undefined;
    if (isImage || isAudio) {
       try {
         const settings = await pool.query('SELECT key, value FROM settings WHERE key LIKE $1', ['evolution_%']);
         const config: any = {}; settings.rows.forEach(r => config[r.key] = r.value);
         const evo = new EvolutionService({ apiUrl: config.evolution_api_url, token: config.evolution_token, instance: config.evolution_instance });
         const media = await evo.loadMedia(data.data.key);
         if (media?.base64) {
           // Use real mimetype from WhatsApp payload, fall back to common defaults.
           const mimeType = (isImage ? msg.imageMessage?.mimetype : msg.audioMessage?.mimetype)
             || (isImage ? 'image/jpeg' : 'audio/ogg');
           mediaData = { data: media.base64.replace(/^data:.*?;base64,/, ""), mimeType };
           console.log(`[Webhook] Mídia carregada (${mimeType}, ${Math.round(mediaData.data.length / 1024)}KB)`);
         } else {
           console.warn('[Webhook] Evolution loadMedia retornou vazio');
         }
       } catch (e: any) {
         console.error('[Webhook] Falha ao carregar mídia:', e?.message || e);
       }
    }

    const aiResult = await handleAIChat(remoteJid, chatHistory, { name: pushName }, mediaData);
    if (aiResult.text) {
       const settings = await pool.query('SELECT key, value FROM settings WHERE key LIKE $1', ['evolution_%']);
       const config: any = {}; settings.rows.forEach(r => config[r.key] = r.value);
       const evo = new EvolutionService({ apiUrl: config.evolution_api_url, token: config.evolution_token, instance: config.evolution_instance });
       
       // Áudio quando: cliente mandou áudio OU resposta é curta (humanização barata).
       const wantAudio = isAudio || aiResult.text.length <= TTS_AUDIO_MAX_CHARS;
       let audioSent = false;
       if (wantAudio) {
         const audio = await generateAudio(aiResult.text);
         if (audio) {
           try {
             await evo.sendAudio(remoteJid, `data:${audio.mimeType};base64,${audio.base64}`);
             audioSent = true;
           } catch (e: any) { console.error('[WhatsApp] sendAudio falhou:', e?.message || e); }
         }
       }
       if (!audioSent) await evo.sendMessage(remoteJid, aiResult.text);

       await pool.query('INSERT INTO messages (text, sender, type, remote_jid, contact_name) VALUES ($1, $2, $3, $4, $5)', [aiResult.text, 'ai', 'text', remoteJid, pushName]);
    }

    for (const call of aiResult.functionCalls) {
      if (call.name === 'generate_pix') {
        await handlePixGenerationTool(remoteJid, pushName, call.args.username, call.args.amount);
      } else if (call.name === 'register_pix_receipt') {
        // Sobe a imagem do comprovante pro R2 (fallback: data URI inline)
        let imageStored: string | null = null;
        if (mediaData?.data) {
          imageStored = await uploadToR2('receipts', mediaData.data, mediaData.mimeType)
                     || `data:${mediaData.mimeType};base64,${mediaData.data}`;
        }
        await handleRegisterPixReceipt(
          remoteJid,
          pushName,
          call.args.payer_name,
          call.args.amount,
          call.args.paid_at,
          imageStored
        );
      }
    }
  } catch (err: any) { console.error('[Webhook Error]', err); }
});

async function handleRegisterPixReceipt(
  remoteJid: string,
  pushName: string,
  payerName: string,
  amount: number,
  paidAt: string,
  imageDataUri: string | null
) {
  try {
    // Procura cliente por número de WhatsApp (normaliza só dígitos).
    const number = (remoteJid || '').split('@')[0].replace(/\D/g, '');
    let customerId: number | null = null;
    let customerUsername: string | null = null;
    if (number) {
      const r = await pool.query(
        "SELECT id, username FROM customers WHERE regexp_replace(COALESCE(whatsapp,''), '\\D', '', 'g') = $1 LIMIT 1",
        [number]
      );
      if (r.rows[0]) { customerId = r.rows[0].id; customerUsername = r.rows[0].username; }
    }

    let parsedDate: Date | null = null;
    try { const d = new Date(paidAt); if (!isNaN(d.getTime())) parsedDate = d; } catch {}

    const inserted = await pool.query(
      `INSERT INTO payment_receipts (customer_username, customer_id, payer_name, amount, paid_at, remote_jid, image_data, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_review') RETURNING id`,
      [customerUsername, customerId, payerName, amount, parsedDate, remoteJid, imageDataUri]
    );
    console.log(`[Receipt] registrado #${inserted.rows[0].id} pagador=${payerName} valor=${amount} cliente=${customerUsername || 'desconhecido'}`);

    // Renova: bumpa expiration_date em 30 dias (se já vencido, conta a partir de hoje).
    if (customerId) {
      await pool.query(
        `UPDATE customers SET expiration_date = GREATEST(COALESCE(expiration_date, NOW()::date), NOW()::date) + INTERVAL '30 days', status = 'active', last_renewal = NOW(), updated_at = NOW() WHERE id = $1`,
        [customerId]
      );
      console.log(`[Receipt] cliente ${customerUsername} renovado por +30 dias`);
    } else {
      console.warn(`[Receipt] sem cliente vinculado a ${number} — renovacao manual necessaria`);
    }
  } catch (e: any) {
    console.error('[Receipt] erro:', e?.message || e);
  }
}

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
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`));
}
startServer();
