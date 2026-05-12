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
// Puppeteer foi movido pro worker.ts (roda no PC local). server.ts so enfileira jobs agora.
import { EvolutionService } from './src/services/evolution-api.js';
import { EdgeTTS } from '@andresaya/edge-tts';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database Connection Logic — DATABASE_URL deve vir das envs (sem fallback hardcoded por seguranca)
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('FATAL: DATABASE_URL nao configurado nas envs.');
  process.exit(1);
}

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
        `CREATE TABLE IF NOT EXISTS settings (key VARCHAR(255) PRIMARY KEY, value TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        // Fila de automacoes — jobs sao executados por um worker externo (PC local) via API.
        // Producao (Coolify) so enfileira; o worker faz polling, executa Puppeteer com Chrome
        // visivel e devolve o resultado.
        `CREATE TABLE IF NOT EXISTS automation_jobs (
          id SERIAL PRIMARY KEY,
          type TEXT NOT NULL,
          payload JSONB DEFAULT '{}'::jsonb,
          status TEXT DEFAULT 'pending',
          result JSONB,
          error TEXT,
          worker_id TEXT,
          attempts INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW(),
          started_at TIMESTAMP,
          finished_at TIMESTAMP
        )`,
        `CREATE INDEX IF NOT EXISTS automation_jobs_status_idx ON automation_jobs(status, created_at)`,
        // Worker heartbeats — pra saber se o PC com worker tá online.
        `CREATE TABLE IF NOT EXISTS worker_heartbeats (
          worker_id TEXT PRIMARY KEY,
          last_seen TIMESTAMP DEFAULT NOW(),
          hostname TEXT,
          version TEXT
        )`
      ];

      for (const sql of tables) await client.query(sql);

      // Idempotent column additions (CREATE TABLE IF NOT EXISTS doesn't add new columns to existing tables)
      const alters = [
        `ALTER TABLE customer_apps ADD COLUMN IF NOT EXISTS android_link TEXT`,
        `ALTER TABLE customer_apps ADD COLUMN IF NOT EXISTS ios_link TEXT`,
        `ALTER TABLE customer_apps ADD COLUMN IF NOT EXISTS icon_url TEXT`,
        `ALTER TABLE customer_apps ADD COLUMN IF NOT EXISTS app_site_url TEXT`,
        // Campos financeiros do cliente (usados no AdminPanel pro calculo de lucro).
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS lines_count INTEGER DEFAULT 1`,
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS cost_per_credit DECIMAL(10,2) DEFAULT 0`,
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(10,2) DEFAULT 0`,
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_renewal TIMESTAMP`,
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

// Global Logger — silencia rotas de polling pra reduzir spam
const QUIET_PATHS = new Set(['/api/panel/queue', '/api/db-status', '/api/health']);
app.use((req, res, next) => {
  if (!QUIET_PATHS.has(req.path)) console.log(`[REQUEST] ${req.method} ${req.url}`);
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

app.post('/api/admin/login',
  rateLimit({ windowMs: 60_000, max: 8, key: clientIp, message: 'Muitas tentativas de login. Aguarde 1 minuto.' }),
  (req, res) => {
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

// --- RATE LIMITING (in-memory, suficiente pra single-instance) ---
const rateLimitBuckets = new Map<string, number[]>();
function rateLimit(opts: { windowMs: number; max: number; key: (req: express.Request) => string; message?: string }) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const k = `${req.path}:${opts.key(req)}`;
    const now = Date.now();
    const arr = (rateLimitBuckets.get(k) || []).filter(t => now - t < opts.windowMs);
    if (arr.length >= opts.max) {
      return res.status(429).json({ error: opts.message || 'Muitas requisicoes. Tente novamente em alguns segundos.' });
    }
    arr.push(now);
    rateLimitBuckets.set(k, arr);
    next();
  };
}
function clientIp(req: express.Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
}
// Limpa buckets antigos a cada 10min
const _rlCleanupTimer: any = setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, arr] of rateLimitBuckets) {
    const fresh = arr.filter(t => t > cutoff);
    if (fresh.length === 0) rateLimitBuckets.delete(k); else rateLimitBuckets.set(k, fresh);
  }
}, 10 * 60 * 1000);
_rlCleanupTimer?.unref?.();

// --- AUTOMATION WORKER (PC local executa Puppeteer com Chrome visivel) ---
// Producao (Coolify) so enfileira jobs; o worker no PC faz polling, executa e devolve resultado.
const WORKER_TOKEN = process.env.WORKER_TOKEN;
if (!WORKER_TOKEN) {
  console.warn('WORKER: WORKER_TOKEN ausente — endpoints /api/worker/* desativados. Configure pra ativar automacoes via PC.');
}
function requireWorker(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!WORKER_TOKEN) return res.status(503).json({ error: 'Worker desativado no servidor' });
  const provided = req.headers['x-worker-token'] as string | undefined;
  if (provided !== WORKER_TOKEN) return res.status(401).json({ error: 'Worker nao autorizado' });
  next();
}

// Enfileira um job e retorna o id. O worker vai pegar via polling.
async function enqueueJob(type: string, payload: any): Promise<number> {
  const r = await pool.query(
    `INSERT INTO automation_jobs (type, payload) VALUES ($1, $2::jsonb) RETURNING id`,
    [type, JSON.stringify(payload || {})]
  );
  return r.rows[0].id;
}

// Espera o job terminar (ou expira). Retorna o resultado do worker.
// Se o worker estiver offline, expira em `timeoutMs` e marca o job como failed.
async function waitForJob(id: number, timeoutMs = 5 * 60 * 1000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await pool.query('SELECT status, result, error FROM automation_jobs WHERE id = $1', [id]);
    const job = r.rows[0];
    if (!job) throw new Error('Job nao encontrado');
    if (job.status === 'done') {
      const result = job.result || {};
      return { success: true, ...result };
    }
    if (job.status === 'failed') return { success: false, message: job.error || 'Falhou sem detalhes' };
    if (job.status === 'cancelled') return { success: false, message: 'Cancelado' };
    await new Promise(r => setTimeout(r, 1500));
  }
  // Timeout — marca como failed pra nao deixar pendente eternamente
  await pool.query(
    `UPDATE automation_jobs SET status='failed', error='Timeout — worker offline ou demorou demais', finished_at=NOW() WHERE id=$1 AND status IN ('pending','running')`,
    [id]
  );
  return { success: false, message: 'Worker offline ou demorou demais. Verifique se o PC com worker esta rodando.' };
}

// Worker: pega proximo job pendente. Atomico via FOR UPDATE SKIP LOCKED.
app.post('/api/worker/poll', requireWorker, async (req, res) => {
  try {
    const { workerId, hostname, version } = req.body || {};
    if (!workerId) return res.status(400).json({ error: 'workerId obrigatorio' });
    // Atualiza heartbeat
    await pool.query(
      `INSERT INTO worker_heartbeats (worker_id, hostname, version, last_seen)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (worker_id) DO UPDATE SET last_seen = NOW(), hostname = EXCLUDED.hostname, version = EXCLUDED.version`,
      [workerId, hostname || null, version || null]
    );
    // Claim um job pendente
    const r = await pool.query(`
      UPDATE automation_jobs
      SET status='running', started_at=NOW(), worker_id=$1, attempts=attempts+1
      WHERE id = (
        SELECT id FROM automation_jobs
        WHERE status='pending'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, type, payload, attempts, created_at
    `, [workerId]);
    res.json(r.rows[0] || null);
  } catch (e: any) {
    console.error('[Worker poll]', e?.message || e);
    res.status(500).json({ error: e.message });
  }
});

// Worker: reporta resultado de um job
app.post('/api/worker/jobs/:id/complete', requireWorker, async (req, res) => {
  try {
    const { id } = req.params;
    const { ok, result, error } = req.body || {};
    const status = ok ? 'done' : 'failed';
    await pool.query(
      `UPDATE automation_jobs SET status=$1, result=$2::jsonb, error=$3, finished_at=NOW() WHERE id=$4`,
      [status, JSON.stringify(result || null), error || null, id]
    );
    console.log(`[Worker] Job #${id} ${status}${error ? ': ' + error : ''}`);
    res.json({ success: true });
  } catch (e: any) {
    console.error('[Worker complete]', e?.message || e);
    res.status(500).json({ error: e.message });
  }
});

// Worker: heartbeat avulso (alem do que o poll ja faz). Util pra ping inicial.
app.post('/api/worker/heartbeat', requireWorker, async (req, res) => {
  try {
    const { workerId, hostname, version } = req.body || {};
    if (!workerId) return res.status(400).json({ error: 'workerId obrigatorio' });
    await pool.query(
      `INSERT INTO worker_heartbeats (worker_id, hostname, version, last_seen)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (worker_id) DO UPDATE SET last_seen = NOW(), hostname = EXCLUDED.hostname, version = EXCLUDED.version`,
      [workerId, hostname || null, version || null]
    );
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- WATCHDOG DE JOBS ORFAOS ---
// Se um job ficou 'running' por mais de 15min sem o worker reportar resultado,
// considera-se que o worker crashou e o job vira 'failed' (em vez de ficar eternamente).
// Roda a cada 2min.
const JOB_TIMEOUT_MS = 15 * 60 * 1000;
async function reapOrphanJobs() {
  try {
    const r = await pool.query(`
      UPDATE automation_jobs
      SET status='failed',
          error=COALESCE(error,'') || ' [watchdog: worker travou ou crashou apos pegar o job]',
          finished_at=NOW()
      WHERE status='running'
        AND started_at < NOW() - INTERVAL '15 minutes'
      RETURNING id, type, worker_id
    `);
    if (r.rows.length > 0) {
      console.warn(`[Watchdog] Marcou ${r.rows.length} job(s) orfaos como failed:`,
        r.rows.map(j => `#${j.id}(${j.type})`).join(', '));
    }
  } catch (e: any) {
    console.error('[Watchdog] erro:', e?.message);
  }
}
setInterval(reapOrphanJobs, 2 * 60 * 1000).unref?.();
// Roda uma vez no boot pra cobrir jobs que ficaram presos antes do restart.
setTimeout(reapOrphanJobs, 10_000);

// --- LIMPEZA PERIODICA (retencao de logs) ---
// Mantem o DB enxuto: deleta jobs antigos, mensagens, ai_usage_logs e heartbeats inativos.
async function cleanupOldRecords() {
  try {
    const results = await Promise.allSettled([
      pool.query(`DELETE FROM automation_jobs WHERE status IN ('done','failed','cancelled') AND finished_at < NOW() - INTERVAL '30 days'`),
      pool.query(`DELETE FROM messages WHERE created_at < NOW() - INTERVAL '180 days'`),
      pool.query(`DELETE FROM ai_usage_logs WHERE created_at < NOW() - INTERVAL '365 days'`),
      pool.query(`DELETE FROM worker_heartbeats WHERE last_seen < NOW() - INTERVAL '7 days'`),
    ]);
    const counts = results.map((r, i) => {
      const label = ['jobs','messages','ai_usage','heartbeats'][i];
      if (r.status === 'fulfilled') return `${label}=${r.value.rowCount || 0}`;
      return `${label}=ERR`;
    });
    console.log(`[Cleanup] ${counts.join(' ')}`);
  } catch (e: any) {
    console.error('[Cleanup] erro:', e?.message);
  }
}
// Roda 1x por dia. Primeiro run 30min apos o boot (evita peak no startup).
setInterval(cleanupOldRecords, 24 * 60 * 60 * 1000).unref?.();
setTimeout(cleanupOldRecords, 30 * 60 * 1000);

// --- VALIDACAO DO WEBHOOK (Evolution) ---
const EVOLUTION_WEBHOOK_SECRET = process.env.EVOLUTION_WEBHOOK_SECRET;
if (!EVOLUTION_WEBHOOK_SECRET) {
  console.warn('SECURITY: EVOLUTION_WEBHOOK_SECRET ausente — webhooks /api/webhooks/evolution/* sao publicos.');
}
function verifyEvolutionWebhook(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!EVOLUTION_WEBHOOK_SECRET) return next(); // permissivo se nao configurado
  const provided = (req.headers['apikey'] || req.headers['x-webhook-secret']) as string | undefined;
  if (provided && provided === EVOLUTION_WEBHOOK_SECRET) return next();
  return res.status(401).json({ error: 'Webhook nao autorizado' });
}

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

type R2UploadResult = { ok: true; url: string } | { ok: false; error: any };

async function uploadToR2(prefix: string, base64: string, mimeType: string): Promise<R2UploadResult> {
  if (!r2Client) return { ok: false, error: { message: 'R2 nao configurado (variaveis ausentes)' } };
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
    return { ok: true, url: `${R2_PUBLIC_BASE}/${key}` };
  } catch (e: any) {
    const detail = {
      message: e?.message,
      name: e?.name,
      code: e?.Code || e?.code,
      statusCode: e?.$metadata?.httpStatusCode,
      requestId: e?.$metadata?.requestId,
    };
    console.error('[R2] upload falhou:', detail);
    return { ok: false, error: detail };
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
    await tts.synthesize(text, 'pt-BR-AntonioNeural');
    const buffer = tts.toBuffer();
    return { base64: buffer.toString('base64'), mimeType: 'audio/mp3' };
  } catch (e: any) {
    console.error('[EdgeTTS] erro:', e?.message || e);
    return null;
  }
}

// --- TTS CACHE (R2) ---
// Frases identicas geram o mesmo audio. Em vez de regenerar (custa $$ no Gemini),
// guarda no R2 com hash do texto+voz como key. Cache em memoria com map<hash, url>.
// O cache em DB persistiria entre restarts, mas mapa em memoria ja resolve 99% dos casos.
const ttsUrlCache = new Map<string, string>();
const TTS_CACHE_MAX = 500;

function hashText(text: string, voice: string): string {
  return crypto.createHash('sha256').update(`${voice}::${text}`).digest('hex').slice(0, 16);
}

// Baixa um arquivo do R2 (URL publica) e retorna base64. Usa pra reaproveitar audio cacheado.
async function fetchR2AsBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const mimeType = r.headers.get('content-type') || 'audio/wav';
    return { base64: buf.toString('base64'), mimeType };
  } catch {
    return null;
  }
}

// Tenta Gemini primeiro (mais natural), cai pra EdgeTTS (gratis) se falhar.
// Com cache: se ja gerou esse texto+voz antes, busca no R2 em vez de chamar a API.
async function generateAudio(text: string): Promise<{ base64: string; mimeType: string } | null> {
  const t = (text || '').trim();
  if (!t) return null;
  const hash = hashText(t, GEMINI_TTS_VOICE);

  // Cache hit em memoria
  const cachedUrl = ttsUrlCache.get(hash);
  if (cachedUrl) {
    const cached = await fetchR2AsBase64(cachedUrl);
    if (cached) {
      console.log(`[TTS Cache] HIT ${hash} (${t.slice(0, 40)}...)`);
      return cached;
    }
    // Cache invalido, segue gerando
    ttsUrlCache.delete(hash);
  }

  // Gera (Gemini -> EdgeTTS fallback)
  const audio = (await generateGeminiTTS(t)) || (await generateEdgeTTS(t));
  if (!audio) return null;

  // Sobe pro R2 (se disponivel) e guarda URL no cache
  if (r2Configured) {
    try {
      const result = await uploadToR2('tts-cache', audio.base64, audio.mimeType);
      if (result.ok === true) {
        // Limita tamanho do cache em memoria (FIFO grosso)
        if (ttsUrlCache.size >= TTS_CACHE_MAX) {
          const firstKey = ttsUrlCache.keys().next().value;
          if (firstKey) ttsUrlCache.delete(firstKey);
        }
        ttsUrlCache.set(hash, result.url);
        console.log(`[TTS Cache] MISS -> cached ${hash} ${result.url}`);
      }
    } catch (e: any) {
      console.warn('[TTS Cache] falha ao cachear:', e?.message);
    }
  }
  return audio;
}

// --- AI HELPERS ---

// Normaliza um JID/numero pra so digitos. Usa pra fazer lookup do cliente.
function normalizePhone(jid: string): string {
  return (jid || '').split('@')[0].replace(/\D/g, '');
}

// Procura cliente pelo numero do WhatsApp. Compara so os digitos (ignora formatacao).
// Tambem tenta sem o '9' de celular brasileiro (pra cobrir cadastros legados).
async function findCustomerByJid(remoteJid: string): Promise<any | null> {
  const number = normalizePhone(remoteJid);
  if (!number) return null;
  // Match exato primeiro
  let r = await pool.query(
    "SELECT * FROM customers WHERE regexp_replace(COALESCE(whatsapp,''), '\\D', '', 'g') = $1 LIMIT 1",
    [number]
  );
  if (r.rows[0]) return r.rows[0];
  // Tenta sem o '9' (celulares antigos cadastrados sem prefixo)
  // 5511912345678 -> 551112345678
  if (number.length === 13 && number.startsWith('55')) {
    const semNove = number.slice(0, 4) + number.slice(5);
    r = await pool.query(
      "SELECT * FROM customers WHERE regexp_replace(COALESCE(whatsapp,''), '\\D', '', 'g') = $1 LIMIT 1",
      [semNove]
    );
    if (r.rows[0]) return r.rows[0];
  }
  // Tenta com '9' (cadastrado sem mas recebendo com)
  if (number.length === 12 && number.startsWith('55')) {
    const comNove = number.slice(0, 4) + '9' + number.slice(4);
    r = await pool.query(
      "SELECT * FROM customers WHERE regexp_replace(COALESCE(whatsapp,''), '\\D', '', 'g') = $1 LIMIT 1",
      [comNove]
    );
    if (r.rows[0]) return r.rows[0];
  }
  return null;
}

// Monta um bloco de contexto pro prompt do Gemini com info do cliente (se conhecido).
async function buildCustomerContext(remoteJid: string, pushName: string): Promise<string> {
  const customer = await findCustomerByJid(remoteJid);
  const phone = normalizePhone(remoteJid);

  if (!customer) {
    return `\n\n=== CONTEXTO ===
Esta pessoa NAO esta cadastrada como cliente no nosso sistema.
- Numero WhatsApp: +${phone}
- Nome do contato (do WhatsApp): ${pushName}
Trate como prospect/visitante. Pergunte o username se precisar atender uma renovacao/suporte.`;
  }

  // Carrega apps do cliente pra dar contexto completo
  const appsRes = await pool.query(
    'SELECT app_name, app_model, mac_address, device_key, username, is_tv FROM customer_apps WHERE customer_id = $1 ORDER BY created_at DESC',
    [customer.id]
  );
  const apps = appsRes.rows;

  const exp = customer.expiration_date
    ? new Date(customer.expiration_date).toLocaleDateString('pt-BR')
    : 'sem data';
  const diasRestantes = customer.expiration_date
    ? Math.ceil((new Date(customer.expiration_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  let ctx = `\n\n=== CONTEXTO DO CLIENTE (CADASTRADO NO SISTEMA) ===
Voce esta atendendo um cliente JA CADASTRADO. Use essas informacoes pra personalizar:
- Nome: ${customer.name || '(sem nome no cadastro)'}
- Username: ${customer.username}
- WhatsApp: ${customer.whatsapp || '+' + phone}
- Status: ${customer.status}
- Vencimento: ${exp}${diasRestantes !== null ? ` (${diasRestantes >= 0 ? 'em ' + diasRestantes + ' dias' : 'VENCIDO ha ' + (-diasRestantes) + ' dias'})` : ''}
- Valor mensal: R$ ${customer.renewal_price || '49,90'}`;

  if (apps.length > 0) {
    ctx += `\n- Apps cadastrados (${apps.length}):`;
    for (const a of apps) {
      ctx += `\n    • ${a.app_name}${a.app_model ? ' (' + a.app_model + ')' : ''}${a.is_tv ? ' [TV]' : ' [Celular]'}`;
    }
  }

  ctx += `\n\nINSTRUCOES IMPORTANTES:
- Cumprimente pelo nome se tiver: "Ola ${customer.name?.split(' ')[0] || 'cliente'}!"
- NAO peca username/WhatsApp — voce ja tem.
- Se for renovacao, ja sabe quem renovar. Use o username "${customer.username}" nas tools.
- Se faltarem poucos dias pro vencimento, ofereca renovacao proativamente.
- Se ja venceu, foque em renovacao urgente.`;

  return ctx;
}

async function handleAIChat(remoteJid: string, history: any[], userInfo: any, media?: { data: string, mimeType: string }) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not defined");
    const GEMINI_MODEL = 'gemini-2.5-flash';
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const DEFAULT_PROMPT = `Você é a atendente oficial do StartPainel. Ajude os clientes a renovar, consultar vencimento e configurar apps.

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

    let systemPrompt = DEFAULT_PROMPT;
    try {
      const r = await pool.query("SELECT value FROM settings WHERE key = 'ai_system_prompt'");
      const dbPrompt = r.rows[0]?.value?.trim();
      if (dbPrompt) systemPrompt = dbPrompt;
    } catch (e) { /* silencioso, usa o default */ }

    // Injeta contexto do cliente (se encontrado pelo numero) — pra IA saber quem ta falando.
    // Pula pra chat web (visitante anonimo) — userInfo.skipCustomerLookup === true.
    if (!userInfo?.skipCustomerLookup && remoteJid && !remoteJid.startsWith('web:')) {
      try {
        const ctx = await buildCustomerContext(remoteJid, userInfo?.name || 'Cliente');
        systemPrompt += ctx;
      } catch (e: any) {
        console.warn('[AI] falha ao montar contexto do cliente:', e?.message);
      }
    }

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

// Queue do painel — agora retorna a fila real de automacoes + status do worker.
app.get('/api/panel/queue', async (req, res) => {
  try {
    const jobs = await pool.query(
      `SELECT id, type, status, payload, error, created_at, started_at, finished_at, worker_id
       FROM automation_jobs
       WHERE status IN ('pending','running')
          OR finished_at > NOW() - INTERVAL '1 hour'
       ORDER BY created_at DESC
       LIMIT 50`
    );
    const workers = await pool.query(
      `SELECT worker_id, hostname, version, last_seen,
              EXTRACT(EPOCH FROM (NOW() - last_seen))::int AS seconds_since_last_seen
       FROM worker_heartbeats
       ORDER BY last_seen DESC`
    );
    const pending = jobs.rows.filter(j => j.status === 'pending');
    const processing = jobs.rows.find(j => j.status === 'running') || null;
    const recent = jobs.rows.filter(j => j.status !== 'pending' && j.status !== 'running');
    // Worker é considerado online se mandou heartbeat nos últimos 30s.
    const onlineWorkers = workers.rows.filter((w: any) => w.seconds_since_last_seen <= 30);
    res.json({
      pending,
      processing,
      recent,
      isBusy: !!processing,
      workers: workers.rows,
      workerOnline: onlineWorkers.length > 0,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Cancela um job pendente (admin only).
app.post('/api/panel/queue/:id/cancel', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE automation_jobs SET status='cancelled', error='Cancelado pelo admin', finished_at=NOW()
       WHERE id=$1 AND status='pending' RETURNING id`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(400).json({ error: 'Job nao esta pendente' });
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- UPLOAD para R2 (admin only) ---
// Comportamento: tenta R2 primeiro; se falhar, faz fallback pra base64 inline pra nao bloquear o usuario.
// Retorna detalhes do erro R2 no header pra debug, mas nao quebra o fluxo.
app.post('/api/upload',
  requireAdmin,
  rateLimit({ windowMs: 60_000, max: 30, key: clientIp, message: 'Muitos uploads. Aguarde 1 minuto.' }),
  async (req, res) => {
  try {
    const { data, mimeType, prefix } = req.body || {};
    if (!data || !mimeType) {
      return res.status(400).json({ error: 'data (base64) e mimeType sao obrigatorios' });
    }
    const sizeKb = Math.round(String(data).length * 3 / 4 / 1024);
    console.log(`[Upload] prefix=${prefix} mime=${mimeType} size=${sizeKb}KB r2=${r2Configured}`);

    if (!r2Configured) {
      const cleanBase64 = String(data).replace(/^data:[^;]+;base64,/, '');
      return res.json({
        url: `data:${mimeType};base64,${cleanBase64}`,
        storage: 'inline',
        note: 'R2 nao configurado — usando base64 inline (lento e ocupa banco).'
      });
    }

    const result = await uploadToR2(prefix || 'misc', data, mimeType);
    if (result.ok === true) {
      console.log(`[Upload] OK R2: ${result.url}`);
      return res.json({ url: result.url, storage: 'r2' });
    } else {
      // R2 falhou — fallback inline pra nao bloquear o usuario, mas avisa.
      console.warn('[Upload] R2 falhou, caindo no fallback inline. Erro:', result.error);
      const cleanBase64 = String(data).replace(/^data:[^;]+;base64,/, '');
      return res.json({
        url: `data:${mimeType};base64,${cleanBase64}`,
        storage: 'inline-fallback',
        r2Error: result.error,
        note: 'R2 falhou — imagem salva como base64 no banco. Veja r2Error pra detalhes.'
      });
    }
  } catch (e: any) {
    console.error('[Upload] erro fatal:', e?.message || e, e?.stack);
    res.status(500).json({ error: e?.message || 'Erro interno no upload' });
  }
});

// Diagnostico rapido — admin only
app.get('/api/upload/status', requireAdmin, (req, res) => {
  res.json({
    r2Configured,
    R2_ACCOUNT_ID: R2_ACCOUNT_ID ? `${R2_ACCOUNT_ID.slice(0, 8)}... (${R2_ACCOUNT_ID.length} chars)` : null,
    R2_BUCKET: R2_BUCKET || null,
    R2_PUBLIC_BASE: R2_PUBLIC_BASE || null,
    R2_ACCESS_KEY_ID: R2_ACCESS_KEY_ID ? `${R2_ACCESS_KEY_ID.slice(0, 4)}... (${R2_ACCESS_KEY_ID.length} chars)` : null,
    R2_SECRET_ACCESS_KEY: R2_SECRET_ACCESS_KEY ? `${R2_SECRET_ACCESS_KEY.slice(0, 4)}... (${R2_SECRET_ACCESS_KEY.length} chars)` : null,
  });
});

// Teste real de conexao R2 — admin only. Sobe um arquivo minimo e retorna o resultado.
app.post('/api/r2/test', requireAdmin, async (req, res) => {
  if (!r2Client) {
    return res.status(400).json({ ok: false, error: 'R2 nao configurado — verifique as 5 variaveis R2_* no Coolify.' });
  }
  const testKey = `_diag/test-${Date.now()}.txt`;
  try {
    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: testKey,
      Body: Buffer.from('startpainel-r2-test'),
      ContentType: 'text/plain',
    }));
    const publicUrl = `${R2_PUBLIC_BASE}/${testKey}`;
    console.log(`[R2 Test] OK — ${publicUrl}`);
    res.json({ ok: true, publicUrl, bucket: R2_BUCKET, accountId: R2_ACCOUNT_ID?.slice(0, 8) });
  } catch (e: any) {
    const detail = {
      message: e?.message,
      name: e?.name,
      code: e?.Code || e?.code,
      statusCode: e?.$metadata?.httpStatusCode,
      requestId: e?.$metadata?.requestId,
    };
    console.error('[R2 Test] falhou:', detail);
    res.status(500).json({ ok: false, error: detail });
  }
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

// (rota duplicada e insegura removida — usar a definida no topo com timingSafeEqual e ADMIN_JWT_SECRET)

// Customers
app.get('/api/customers', async (req, res) => {
  const result = await pool.query('SELECT * FROM customers ORDER BY created_at DESC');
  res.json(result.rows);
});

app.post('/api/customers', async (req, res) => {
  const { username, name, whatsapp, renewal_price, expiration_date, playlist_url, lines_count, cost_per_credit, amount_paid } = req.body;
  const result = await pool.query(
    `INSERT INTO customers (username, name, whatsapp, renewal_price, expiration_date, playlist_url, lines_count, cost_per_credit, amount_paid)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [username, name, whatsapp, renewal_price || 49.90, expiration_date, playlist_url, lines_count || 1, cost_per_credit || 0, amount_paid || 0]
  );
  res.json(result.rows[0]);
});

app.put('/api/customers/:id', async (req, res) => {
  const { id } = req.params;
  const { username, name, whatsapp, renewal_price, expiration_date, playlist_url, status, lines_count, cost_per_credit, amount_paid } = req.body;
  // Faz COALESCE pra preservar campos que o cliente nao enviou (parcial update).
  const result = await pool.query(
    `UPDATE customers SET
       username=COALESCE($1, username),
       name=COALESCE($2, name),
       whatsapp=COALESCE($3, whatsapp),
       renewal_price=COALESCE($4, renewal_price),
       expiration_date=COALESCE($5, expiration_date),
       playlist_url=COALESCE($6, playlist_url),
       status=COALESCE($7, status),
       lines_count=COALESCE($8, lines_count),
       cost_per_credit=COALESCE($9, cost_per_credit),
       amount_paid=COALESCE($10, amount_paid),
       updated_at=NOW()
     WHERE id=$11 RETURNING *`,
    [username, name, whatsapp, renewal_price, expiration_date, playlist_url, status, lines_count, cost_per_credit, amount_paid, id]
  );
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

// Manual Run Routes — agora enfileiram pro worker (PC local) executar e aguardam o resultado.
// Se o worker estiver offline, expira em 5min e retorna erro claro pro frontend.
app.post('/api/panel/extend', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username obrigatorio' });
    const jobId = await enqueueJob('renew_client', { username });
    const result = await waitForJob(jobId);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/automations/ibo/run', async (req, res) => {
  try {
    const { mac, key, playlistUrl, targetUrl } = req.body;
    if (!mac || !key || !playlistUrl) return res.status(400).json({ error: 'mac, key e playlistUrl obrigatorios' });
    // Busca geminiKey aqui pra nao precisar dar permissao ao worker.
    const geminiKeyRes = await pool.query('SELECT value FROM settings WHERE key = $1', ['gemini_api_key']);
    const geminiKey = geminiKeyRes.rows[0]?.value;
    const jobId = await enqueueJob('ibo_setup', { mac, key, playlistUrl, targetUrl, geminiKey });
    const result = await waitForJob(jobId);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/automations/startpainel/create-client', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username obrigatorio' });
    const jobId = await enqueueJob('create_client', { username });
    const result = await waitForJob(jobId);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/automations/startpainel/activate-ultra', async (req, res) => {
  try {
    const { username, mac } = req.body;
    if (!username || !mac) return res.status(400).json({ error: 'username e mac obrigatorios' });
    const jobId = await enqueueJob('activate_ultra', { username, mac });
    const result = await waitForJob(jobId);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// AI Usage Stats
app.get('/api/ai-usage', async (req, res) => {
  try {
    const stats = await pool.query('SELECT COUNT(*) as total_requests, SUM(prompt_tokens) as total_prompt_tokens, SUM(candidates_tokens) as total_candidates_tokens, SUM(estimated_cost) as total_estimated_cost FROM ai_usage_logs');
    const recent = await pool.query('SELECT * FROM ai_usage_logs ORDER BY created_at DESC LIMIT 10');
    // Serie diaria dos ultimos 30 dias — pra grafico no admin
    const daily = await pool.query(`
      SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date,
             COUNT(*)::int AS requests,
             SUM(prompt_tokens)::int AS prompt_tokens,
             SUM(candidates_tokens)::int AS candidates_tokens,
             SUM(estimated_cost)::float AS cost
      FROM ai_usage_logs
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1 ASC
    `);
    // Breakdown por modelo
    const byModel = await pool.query(`
      SELECT model, COUNT(*)::int as requests, SUM(estimated_cost)::float as cost
      FROM ai_usage_logs
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY model
      ORDER BY cost DESC
    `);
    res.json({
      summary: stats.rows[0],
      recent: recent.rows,
      daily: daily.rows,
      byModel: byModel.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Public Chat (visitor-facing widget on the website)
// Sessions are identified by a client-generated UUID stored in localStorage.
// All messages are persisted with remote_jid = `web:${sessionId}@public` so
// the admin Multi-Chat can also see/answer them.
app.post('/api/public-chat',
  rateLimit({ windowMs: 60_000, max: 12, key: req => (req.body?.sessionId || clientIp(req)) as string, message: 'Aguarde alguns segundos antes de mandar outra mensagem.' }),
  async (req, res) => {
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
app.post('/api/webhooks/evolution/:event?',
  // Rate limit por IP — mesmo com secret valido, evita flood acidental.
  rateLimit({ windowMs: 60_000, max: 120, key: clientIp, message: 'Webhook rate limit excedido.' }),
  verifyEvolutionWebhook,
  async (req, res) => {
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
        // Sobe a imagem do comprovante pro R2 (fallback: data URI inline se R2 falhar)
        let imageStored: string | null = null;
        if (mediaData?.data) {
          const r = await uploadToR2('receipts', mediaData.data, mediaData.mimeType);
          imageStored = r.ok ? r.url : `data:${mediaData.mimeType};base64,${mediaData.data}`;
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
  app.listen(Number(PORT), '0.0.0.0', () => console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`));
}
startServer();
