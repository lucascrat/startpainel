import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
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
import { supabaseStartflix, supabaseAuthAdmin } from './src/lib/supabaseStartflix.js';
import * as warezApi from './src/services/wareztv-api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// HANDLERS GLOBAIS DE CRASH — evitam que o processo morra (e cause 502)
// por causa de uma promessa rejeitada sem .catch (ex: fetch p/ Evolution,
// WarezTV, Gemini falhando). Loga e mantém o servidor no ar.
// ============================================================
process.on('unhandledRejection', (reason: any) => {
  console.error('[CRASH-GUARD] Unhandled Rejection (servidor continua):', reason?.message || reason);
});
process.on('uncaughtException', (err: any) => {
  console.error('[CRASH-GUARD] Uncaught Exception (servidor continua):', err?.message || err);
  if (err?.stack) console.error(err.stack);
});

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
        `CREATE TABLE IF NOT EXISTS customers (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT, whatsapp TEXT, password TEXT, dns TEXT, renewal_price DECIMAL(10,2) DEFAULT 25, expiration_date DATE, playlist_url TEXT, status TEXT DEFAULT 'active', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
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
        )`,
        // Catálogo público de apps que o atendimento pode sugerir/enviar pro cliente.
        // Diferente de customer_apps (que e por cliente cadastrado), este e o catalogo
        // mestre que a IA consulta pra sugerir downloads e pedir prints.
        `CREATE TABLE IF NOT EXISTS app_catalog (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          display_order INTEGER DEFAULT 0,
          description TEXT,
          app_image_url TEXT,
          example_image_url TEXT,
          example_instruction TEXT,
          android_link TEXT,
          ios_link TEXT,
          web_link TEXT,
          device_type TEXT DEFAULT 'todos',
          is_active BOOLEAN DEFAULT true,
          dns TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE INDEX IF NOT EXISTS app_catalog_active_order_idx ON app_catalog(is_active, display_order)`,
        `CREATE TABLE IF NOT EXISTS processed_app_payments (payment_id TEXT PRIMARY KEY, processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
        // Clientes do provedor Wareztv (Wplay) — gerenciados via API, sem Puppeteer
        `CREATE TABLE IF NOT EXISTS wareztv_customers (
          id SERIAL PRIMARY KEY,
          warez_line_id INTEGER UNIQUE,
          username TEXT UNIQUE NOT NULL,
          password TEXT,
          whatsapp TEXT,
          name TEXT,
          notes TEXT,
          exp_date DATE,
          status TEXT DEFAULT 'active',
          is_trial BOOLEAN DEFAULT false,
          plan_name TEXT,
          max_connections INTEGER DEFAULT 1,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )`
      ];

      for (const sql of tables) await client.query(sql);

      // Idempotent column additions (CREATE TABLE IF NOT EXISTS doesn't add new columns to existing tables)
      const alters = [
        `ALTER TABLE customer_apps ADD COLUMN IF NOT EXISTS android_link TEXT`,
        `ALTER TABLE customer_apps ADD COLUMN IF NOT EXISTS ios_link TEXT`,
        `ALTER TABLE customer_apps ADD COLUMN IF NOT EXISTS icon_url TEXT`,
        `ALTER TABLE customer_apps ADD COLUMN IF NOT EXISTS app_site_url TEXT`,
        `ALTER TABLE customer_apps ADD COLUMN IF NOT EXISTS host TEXT`,
        `ALTER TABLE app_catalog ADD COLUMN IF NOT EXISTS dns TEXT`,
        `ALTER TABLE app_catalog ADD COLUMN IF NOT EXISTS install_video_url TEXT`,
        `ALTER TABLE app_catalog ADD COLUMN IF NOT EXISTS youtube_url TEXT`,
        // Até 5 imagens tutoriais/screenshots enviadas ao cliente junto com o app
        `ALTER TABLE app_catalog ADD COLUMN IF NOT EXISTS image_1_url TEXT`,
        `ALTER TABLE app_catalog ADD COLUMN IF NOT EXISTS image_2_url TEXT`,
        `ALTER TABLE app_catalog ADD COLUMN IF NOT EXISTS image_3_url TEXT`,
        `ALTER TABLE app_catalog ADD COLUMN IF NOT EXISTS image_4_url TEXT`,
        `ALTER TABLE app_catalog ADD COLUMN IF NOT EXISTS image_5_url TEXT`,
        // === LANDPAGE STARTFLIX — campos de categorização na vitrine pública ===
        `ALTER TABLE app_catalog ADD COLUMN IF NOT EXISTS landing_category TEXT`,
        `ALTER TABLE app_catalog ADD COLUMN IF NOT EXISTS landing_rank INTEGER`,
        `ALTER TABLE app_catalog ADD COLUMN IF NOT EXISTS landing_price TEXT`,
        // Tabela de banners da landpage
        `CREATE TABLE IF NOT EXISTS landing_banners (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          subtitle TEXT DEFAULT '',
          image_url TEXT DEFAULT '',
          cta_label TEXT DEFAULT 'Saiba mais',
          badge TEXT DEFAULT '',
          display_order INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW()
        )`,
        // Jogos do dia (alimentado por TheSportsDB + curadoria manual de canais)
        `CREATE TABLE IF NOT EXISTS daily_games (
          id SERIAL PRIMARY KEY,
          source_id TEXT UNIQUE,                -- idEvent da TheSportsDB (null se cadastro manual)
          game_date DATE NOT NULL,              -- data do jogo (YYYY-MM-DD)
          kickoff_time TIMESTAMP,               -- horario do apito inicial (UTC)
          league TEXT,
          league_badge TEXT,
          home_team TEXT NOT NULL,
          home_logo TEXT,
          away_team TEXT NOT NULL,
          away_logo TEXT,
          status TEXT DEFAULT 'scheduled',      -- scheduled | live | finished
          home_score INTEGER,
          away_score INTEGER,
          channels JSONB DEFAULT '[]'::jsonb,   -- [{name:'SporTV',logo:'...'},{name:'GE',logo:'...'}]
          highlight BOOLEAN DEFAULT false,      -- destaque na landpage (jogo grande)
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE INDEX IF NOT EXISTS idx_daily_games_date ON daily_games (game_date)`,
        `CREATE INDEX IF NOT EXISTS idx_daily_games_kickoff ON daily_games (kickoff_time)`,
        // Campos financeiros do cliente (usados no AdminPanel pro calculo de lucro).
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS lines_count INTEGER DEFAULT 1`,
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS cost_per_credit DECIMAL(10,2) DEFAULT 0`,
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(10,2) DEFAULT 0`,
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_renewal TIMESTAMP`,
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS password TEXT`,
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS dns TEXT`,
        // === MEMORIA DA IA (clientes cadastrados) ===
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS ai_summary TEXT`,
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS ai_facts JSONB DEFAULT '{}'::jsonb`,
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS ai_last_summary_at TIMESTAMP`,
        // === PROVEDOR DO CLIENTE (startpainel | wareztv | outro) ===
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'startpainel'`,
        // === MÚLTIPLOS NÚMEROS POR CLIENTE ===
        `CREATE TABLE IF NOT EXISTS customer_phones (
          id SERIAL PRIMARY KEY,
          customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
          phone TEXT NOT NULL,
          label TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS customer_phones_norm_idx ON customer_phones(regexp_replace(phone, '\\D', '', 'g'))`,
        // === DADOS WAREZTV (clientes unificados no banco geral) ===
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS warez_line_id INTEGER`,
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT false`,
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS plan_name TEXT`,
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS max_connections INTEGER DEFAULT 1`,
        `CREATE UNIQUE INDEX IF NOT EXISTS customers_warez_line_id_idx ON customers(warez_line_id) WHERE warez_line_id IS NOT NULL`,
        // === DEVICE LOCK (1 aparelho por conta) ===
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS active_device_id TEXT`,
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS active_device_name TEXT`,
        `ALTER TABLE customers ADD COLUMN IF NOT EXISTS device_locked_at TIMESTAMP`,
        // === LEADS (potenciais clientes — capturados automaticamente) ===
        `CREATE TABLE IF NOT EXISTS leads (
          id SERIAL PRIMARY KEY,
          remote_jid TEXT NOT NULL UNIQUE,
          alt_jid TEXT,
          push_name TEXT,
          first_message TEXT,
          message_count INTEGER DEFAULT 1,
          status TEXT DEFAULT 'new',
          notes TEXT,
          ai_summary TEXT,
          ai_facts JSONB DEFAULT '{}'::jsonb,
          ai_last_summary_at TIMESTAMP,
          first_contact TIMESTAMP DEFAULT NOW(),
          last_contact TIMESTAMP DEFAULT NOW(),
          converted_to_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL
        )`,
        `CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status, last_contact DESC)`,
        `CREATE INDEX IF NOT EXISTS leads_alt_jid_idx ON leads(alt_jid) WHERE alt_jid IS NOT NULL`,
        // Telefone informado pelo visitante no chat web (entrada exige nome + WhatsApp).
        `ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone TEXT`,
        `CREATE INDEX IF NOT EXISTS leads_phone_idx ON leads(phone) WHERE phone IS NOT NULL`,
        // === POOL DE LISTAS M3U ===
        // Sistema de compartilhamento de listas: 50 listas servem 100+ usuarios
        // pois nem todos ficam online ao mesmo tempo. Cada acesso "reserva" uma lista
        // que volta ao pool quando o usuario sai ou perde o heartbeat.
        `CREATE TABLE IF NOT EXISTS m3u_pool_lists (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          m3u_url TEXT NOT NULL,
          notes TEXT,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS m3u_access_codes (
          id SERIAL PRIMARY KEY,
          code VARCHAR(32) UNIQUE NOT NULL,
          label TEXT,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS m3u_leases (
          id SERIAL PRIMARY KEY,
          code VARCHAR(32) NOT NULL,
          list_id INTEGER REFERENCES m3u_pool_lists(id),
          device_id TEXT,
          leased_at TIMESTAMP DEFAULT NOW(),
          last_heartbeat TIMESTAMP DEFAULT NOW(),
          released_at TIMESTAMP,
          is_active BOOLEAN DEFAULT true
        )`,
        `CREATE INDEX IF NOT EXISTS m3u_leases_active_idx ON m3u_leases(is_active, last_heartbeat)`,
        `CREATE INDEX IF NOT EXISTS m3u_leases_code_active_idx ON m3u_leases(code, is_active)`,
        `CREATE INDEX IF NOT EXISTS m3u_lists_active_idx ON m3u_pool_lists(is_active)`,
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

// Auto-release de leases M3U inativas — roda a cada 20s.
// Se o app não mandou heartbeat nos últimos 100s, a lista volta ao pool.
// (o app envia heartbeat a cada 40s, então tolera ~2 heartbeats perdidos antes de liberar.)
// Esse é o mecanismo CONFIÁVEL de liberação — o onDestroy do Android não é garantido
// pelo sistema, então o painel reflete a realidade em no máximo ~2 min mesmo sem release.
setInterval(async () => {
  try {
    const r = await pool.query(
      `UPDATE m3u_leases SET is_active = false, released_at = NOW()
       WHERE is_active = true
         AND last_heartbeat < NOW() - INTERVAL '100 seconds'`
    );
    if (r.rowCount && r.rowCount > 0)
      console.log(`[M3U] Auto-liberou ${r.rowCount} lease(s) por inatividade.`);
  } catch { /* ignora — db pode ainda estar inicializando */ }
}, 20_000);

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

const PUBLIC_SETTING_KEYS = new Set(['attendant_name', 'attendant_image', 'whatsapp_support']);
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
  console.warn('SECURITY: EVOLUTION_WEBHOOK_SECRET ausente — usando evolution_token do DB pra validar webhooks.');
}

// Cache da chave Gemini vinda da tabela settings (refresh a cada 60s).
// O banco tem prioridade; GEMINI_API_KEY do .env serve de fallback.
// Invalidado imediatamente quando o admin salva uma nova chave via painel.
let _geminiKeyCache: { value: string | null; ts: number } = { value: null, ts: 0 };
async function getGeminiApiKey(): Promise<string | null> {
  if (Date.now() - _geminiKeyCache.ts < 60_000) return _geminiKeyCache.value;
  try {
    const r = await pool.query("SELECT value FROM settings WHERE key = 'gemini_api_key'");
    const dbKey = r.rows[0]?.value?.trim() || null;
    _geminiKeyCache = { value: dbKey || process.env.GEMINI_API_KEY || null, ts: Date.now() };
  } catch {
    _geminiKeyCache = { value: _geminiKeyCache.value ?? process.env.GEMINI_API_KEY ?? null, ts: Date.now() };
  }
  return _geminiKeyCache.value;
}

// Cache em memoria do evolution_token (refresh a cada 60s) — usado pra validar webhooks
// quando EVOLUTION_WEBHOOK_SECRET nao esta setado. Evolution naturalmente envia 'apikey'
// header com esse valor, entao a gente reaproveita pra autenticacao sem config extra.
let _evolutionTokenCache: { value: string | null; ts: number } = { value: null, ts: 0 };
async function getEvolutionTokenCached(): Promise<string | null> {
  if (Date.now() - _evolutionTokenCache.ts < 60_000) return _evolutionTokenCache.value;
  try {
    const r = await pool.query("SELECT value FROM settings WHERE key = 'evolution_token'");
    _evolutionTokenCache = { value: r.rows[0]?.value || null, ts: Date.now() };
  } catch { /* mantem cache antigo */ }
  return _evolutionTokenCache.value;
}

async function verifyEvolutionWebhook(req: express.Request, res: express.Response, next: express.NextFunction) {
  const provided = (req.headers['apikey'] || req.headers['x-webhook-secret']) as string | undefined;
  const event = req.params.event || '?';

  // Modo 1: secret explicito via env (preferido pra producao com Evolution custom headers)
  if (EVOLUTION_WEBHOOK_SECRET) {
    if (provided && provided === EVOLUTION_WEBHOOK_SECRET) return next();
    console.warn(`[Webhook Auth] REJEITADO modo=secret event=${event} provided=${provided?.slice(0, 8)}... expected=${EVOLUTION_WEBHOOK_SECRET.slice(0, 8)}...`);
    return res.status(401).json({ error: 'Webhook nao autorizado (secret invalido)' });
  }

  // Modo 2: valida usando o proprio token do Evolution (que ele ja envia naturalmente no header apikey)
  const evoToken = await getEvolutionTokenCached();
  if (evoToken && provided && provided === evoToken) return next();

  // Modo 3 (fallback permissivo): nem secret nem token configurados — aceita tudo.
  if (!evoToken) {
    console.warn(`[Webhook Auth] PERMISSIVO event=${event} (sem evolution_token no banco — qualquer requisicao passa)`);
    return next();
  }

  console.warn(`[Webhook Auth] REJEITADO modo=token event=${event} provided=${provided ? provided.slice(0, 8) + '...' : 'MISSING'} expected=${evoToken.slice(0, 8)}...`);
  return res.status(401).json({ error: 'Webhook nao autorizado (apikey nao bate com evolution_token)' });
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
    const apiKey = await getGeminiApiKey();
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

/**
 * Sanitiza o username de teste: remove espaços, tudo junto e adiciona sufixo app2026.
 */
function sanitizeTestUsername(username: string): string {
  let sanitized = (username || '').trim().replace(/\s+/g, '').toLowerCase();
  if (!sanitized) {
    sanitized = 'teste' + Math.floor(Math.random() * 100000);
  }
  if (!sanitized.endsWith('app2026')) {
    sanitized += 'app2026';
  }
  return sanitized;
}

// Procura cliente pelo numero do WhatsApp. Compara so os digitos (ignora formatacao).
// Aceita ate 2 JIDs (remoteJid + remoteJidAlt) pra cobrir o caso do WhatsApp moderno
// que envia mensagens com JID @lid (identidade mascarada) e o numero REAL fica no
// campo remoteJidAlt. Sem o alt, clientes com @lid NUNCA seriam reconhecidos.
// Retorna { customer, phoneLabel } — phoneLabel é o nome do contato vinculado (ex: "Solange")
async function findCustomerByJid(remoteJid: string, altJid?: string | null): Promise<{ customer: any; phoneLabel: string | null } | null> {
  // Tenta cada JID, e pra cada um as variacoes do '9' brasileiro
  const candidates: string[] = [];
  for (const jid of [remoteJid, altJid].filter(Boolean) as string[]) {
    const n = normalizePhone(jid);
    if (!n || candidates.includes(n)) continue;
    candidates.push(n);
    // Variacao sem '9' (celular antigo cadastrado sem)
    if (n.length === 13 && n.startsWith('55')) {
      const semNove = n.slice(0, 4) + n.slice(5);
      if (!candidates.includes(semNove)) candidates.push(semNove);
    }
    // Variacao com '9'
    if (n.length === 12 && n.startsWith('55')) {
      const comNove = n.slice(0, 4) + '9' + n.slice(4);
      if (!candidates.includes(comNove)) candidates.push(comNove);
    }
  }

  if (candidates.length === 0) return null;

  // 1. Busca no campo principal customers.whatsapp
  const r = await pool.query(
    `SELECT * FROM customers WHERE regexp_replace(COALESCE(whatsapp,''), '\\D', '', 'g') = ANY($1::text[]) LIMIT 1`,
    [candidates]
  );
  if (r.rows[0]) return { customer: r.rows[0], phoneLabel: null };

  // 2. Busca em customer_phones (números secundários vinculados)
  const r2 = await pool.query(
    `SELECT cp.label, c.*
     FROM customer_phones cp
     JOIN customers c ON c.id = cp.customer_id
     WHERE regexp_replace(cp.phone, '\\D', '', 'g') = ANY($1::text[])
     LIMIT 1`,
    [candidates]
  );
  if (r2.rows[0]) {
    const { label, ...customer } = r2.rows[0];
    return { customer, phoneLabel: label || null };
  }

  return null;
}

// Formata BRL pra exibir bonito ("R$ 49,90")
function formatBRL(value: any): string {
  const n = Number(value);
  if (!isFinite(n)) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Formata data brasileira ("13/05/2026")
function formatDate(d: any): string {
  if (!d) return 'sem data';
  const date = new Date(d);
  if (isNaN(date.getTime())) return 'sem data';
  return date.toLocaleDateString('pt-BR');
}

// Conta dias entre hoje e uma data — positivo no futuro, negativo no passado.
function daysFromNow(d: any): number | null {
  if (!d) return null;
  const date = new Date(d);
  if (isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// Mascara MAC ou Key pra dica/segurança no log (mostra primeiros + ultimos chars)
function maskValue(v: string | null | undefined, keep = 4): string {
  if (!v) return '-';
  if (v.length <= keep * 2) return v;
  return v.slice(0, keep) + '…' + v.slice(-keep);
}

/**
 * Monta o contexto completo do cliente pra IA. Inclui:
 * - Dados pessoais (nome, WhatsApp, username)
 * - Status, vencimento (com dias absolutos e categorizado: vencido/critico/ok)
 * - Financeiro (valor, custo, lucro, total pago)
 * - Lista completa de apps do cliente (MAC, key, username, password, links) — info real
 * - Historico de pagamentos recentes (ultimos 3 comprovantes)
 * - Renovacao (ultima data)
 * - Instrucoes contextuais (o que fazer baseado no estado)
 *
 * Tudo aqui vai DIRETO no system prompt do Gemini. A IA passa a operar como um
 * atendente que ja CONHECE o cliente — nao pergunta o que ja sabe.
 */

// ── LEADS (contatos ainda nao cadastrados) ──────────────────────────────────

/** Insere ou atualiza o lead. Chamado a cada mensagem recebida de nao-cliente. */
async function upsertLead(
  remoteJid: string,
  pushName: string,
  firstMsg: string,
  altJid?: string | null,
  phone?: string | null
): Promise<void> {
  try {
    // Tenta com phone (versão nova). Se a coluna ainda não foi adicionada, cai no fallback.
    await pool.query(
      `INSERT INTO leads (remote_jid, alt_jid, push_name, first_message, phone, message_count, last_contact)
       VALUES ($1, $2, $3, $4, $5, 1, NOW())
       ON CONFLICT (remote_jid) DO UPDATE SET
         push_name        = COALESCE(NULLIF($3,''), leads.push_name),
         alt_jid          = COALESCE($2, leads.alt_jid),
         phone            = COALESCE(NULLIF($5,''), leads.phone),
         message_count    = leads.message_count + 1,
         last_contact     = NOW(),
         status           = CASE WHEN leads.status = 'converted' THEN leads.status ELSE 'active' END`,
      [remoteJid, altJid || null, pushName || '', firstMsg.slice(0, 500), phone || null]
    );
  } catch (e) {
    console.error('[Lead] upsertLead error:', e);
  }
}

/**
 * Recomputa ai_summary + ai_facts para lead OU cliente cadastrado.
 * kind = 'lead' | 'customer'
 * Tem cooldown de 30 min para nao chamar Gemini demais.
 * Roda em background (nao bloqueia a resposta ao cliente).
 */
async function maybeRecomputeAISummary(remoteJid: string, kind: 'lead' | 'customer', altJid?: string | null): Promise<void> {
  try {
    const COOLDOWN_MS = 30 * 60 * 1000; // 30 min

    let customerId: number | null = null;

    if (kind === 'customer') {
      // Para clientes: resolve pelo JID → pega o ID do cadastro
      const found = await findCustomerByJid(remoteJid, altJid);
      if (!found) return;
      customerId = found.customer.id;
      const rec = await pool.query(
        `SELECT ai_last_summary_at FROM customers WHERE id = $1`, [customerId]
      );
      if (!rec.rows.length) return;
      const lastAt: Date | null = rec.rows[0].ai_last_summary_at;
      if (lastAt && Date.now() - new Date(lastAt).getTime() < COOLDOWN_MS) return;
    } else {
      // Para leads: lookup direto por remote_jid
      const rec = await pool.query(
        `SELECT ai_last_summary_at FROM leads WHERE remote_jid = $1`, [remoteJid]
      );
      if (!rec.rows.length) return;
      const lastAt: Date | null = rec.rows[0].ai_last_summary_at;
      if (lastAt && Date.now() - new Date(lastAt).getTime() < COOLDOWN_MS) return;
    }

    // Busca historico de mensagens (tabela messages, coluna text/sender)
    const hist = await pool.query(
      `SELECT text, sender, created_at FROM messages
       WHERE remote_jid = $1
       ORDER BY created_at DESC LIMIT 50`,
      [remoteJid]
    );
    if (hist.rows.length < 3) return; // pouco historico — nao vale resumir

    const convo = hist.rows.reverse().map(r =>
      `[${(r.sender === 'ai' || r.sender === 'attendant') ? 'Atendente' : 'Cliente'}] ${r.text || ''}`
    ).join('\n');

    const summaryPrompt = `Analise essa conversa de atendimento e extraia informacoes uteis sobre o cliente.

CONVERSA:
${convo}

Responda APENAS com JSON valido neste formato exato:
{
  "summary": "resumo curto em 1-2 frases do que o cliente quer/precisa",
  "facts": {
    "device_type": "Smart TV | Celular | PC | TV Box | (vazio se nao mencionado)",
    "app_tried": "apps que ele ja tentou (lista separada por virgula ou vazio)",
    "issue": "problema principal relatado (vazio se nao ha problema)",
    "name_mentioned": "nome que ele disse ou vazio",
    "interested_in": "o que ele quer comprar/testar ou vazio",
    "last_intent": "ultima intencao clara do cliente"
  }
}`;

    const apiKey = await getGeminiApiKey();
    if (!apiKey) return;
    const genAISummary = new GoogleGenerativeAI(apiKey);
    const summaryModel = genAISummary.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await summaryModel.generateContent(summaryPrompt);
    const raw = result.response.text()?.trim() || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const parsed = JSON.parse(jsonMatch[0]);
    const summary = parsed.summary || '';
    const facts = parsed.facts || {};

    if (kind === 'customer' && customerId) {
      await pool.query(
        `UPDATE customers SET ai_summary = $1, ai_facts = $2, ai_last_summary_at = NOW()
         WHERE id = $3`,
        [summary, JSON.stringify(facts), customerId]
      );
    } else {
      await pool.query(
        `UPDATE leads SET ai_summary = $1, ai_facts = $2, ai_last_summary_at = NOW()
         WHERE remote_jid = $3`,
        [summary, JSON.stringify(facts), remoteJid]
      );
    }
    console.log(`[AI Memory] Summary updated for ${kind} ${remoteJid}: "${summary}"`);
  } catch (e) {
    console.error('[AI Memory] maybeRecomputeAISummary error:', e);
  }
}

/** Formata contexto de lead (nao-cliente) para injecao no prompt do Gemini. */
async function buildLeadContext(remoteJid: string): Promise<string> {
  try {
    const res = await pool.query(
      `SELECT push_name, message_count, first_message, first_contact, last_contact,
              ai_summary, ai_facts, status, notes
       FROM leads WHERE remote_jid = $1`,
      [remoteJid]
    );
    if (!res.rows.length) return '';
    const lead = res.rows[0];
    const facts: Record<string, string> = lead.ai_facts || {};

    let ctx = `\n\nMEMORIA DO CONTATO (${lead.push_name || 'sem nome'} — ${lead.message_count} msg${lead.message_count !== 1 ? 's' : ''} enviadas):`;
    if (lead.ai_summary) ctx += `\n- Resumo: ${lead.ai_summary}`;
    if (facts.device_type) ctx += `\n- Dispositivo: ${facts.device_type}`;
    if (facts.app_tried) ctx += `\n- Apps testados: ${facts.app_tried}`;
    if (facts.issue) ctx += `\n- Problema relatado: ${facts.issue}`;
    if (facts.interested_in) ctx += `\n- Interesse: ${facts.interested_in}`;
    if (facts.last_intent) ctx += `\n- Ultima intencao: ${facts.last_intent}`;
    if (lead.notes) ctx += `\n- Notas: ${lead.notes}`;
    ctx += `\n\nUSE essa memoria para nao repetir perguntas que voce ja fez antes. Retome de onde parou naturalmente.`;
    return ctx;
  } catch {
    return '';
  }
}

async function buildCustomerContext(remoteJid: string, pushName: string, altJid?: string | null): Promise<string> {
  const found = await findCustomerByJid(remoteJid, altJid);
  const customer = found?.customer ?? null;
  const phoneLabel = found?.phoneLabel ?? null;  // ex: "Solange" quando é número secundário
  // Pra exibir o numero, prefere o alt (real) se disponivel
  const phone = normalizePhone(altJid || remoteJid);

  // === Cliente NAO cadastrado — fluxo de prospeccao + escolha de app ===
  if (!customer) {
    // Carrega ordem do catalogo pra IA saber em que ordem oferecer os apps.
    const catalog = await getAppCatalogCached();
    let appList = '';
    if (catalog.length > 0) {
      appList = '\n\nORDEM DOS APPS A SUGERIR (testa um por vez, do primeiro ao ultimo):';
      catalog.forEach((a, i) => {
        appList += `\n  ${i + 1}º — [id=${a.id}] ${a.name} (${a.device_type})${a.description ? ' — ' + a.description : ''}`;
      });
    }

    const leadCtx = await buildLeadContext(remoteJid);

    return `\n\n=== CONTEXTO DO CONTATO (NOVO — NAO CADASTRADO) ===
Esta pessoa NAO esta cadastrada como cliente.
- Numero WhatsApp: +${phone}
- Nome no WhatsApp: ${pushName}${leadCtx}${appList}

FLUXO DE ATENDIMENTO (siga esses passos na ordem):

PASSO 1 — DESCOBRIR O APARELHO:
- Pergunte: "Em qual aparelho voce quer assistir? Smart TV, celular ou PC?"
- Aguarde a resposta antes de continuar.

PASSO 2 — SUGERIR O 1o APP DA LISTA:
- Ofereca o PRIMEIRO app do catalogo (display_order menor) compativel com o aparelho dele.
- Use SEMPRE a tool send_app_info com o app_id correspondente. NUNCA invente um app_id — use apenas IDs da lista acima.
- Pergunte se ele encontra esse app na loja/celular dele.

PASSO 3 — SE NAO ACHAR, OFERECER O PROXIMO:
- Se ele disser "nao achei" ou "nao tem" ou "nao encontrei": ofereca o PROXIMO app da lista (o 2o).
- Continue oferecendo um por um na ordem ate ele achar.
- NUNCA pule a ordem. Se ele acabou de tentar o 2o, o proximo e o 3o.

PASSO 4 — APP ENCONTRADO, COLETAR MAC:
Quando ele disser "achei" / "instalei" / "abri o app":
- Use a tool request_screenshot com o app_id que ele instalou — vai mandar imagem mostrando onde fica o MAC na tela inicial.
- Peca em texto: "Otimo! Me manda o MAC que aparece na tela inicial do app (algo tipo XX:XX:XX:XX:XX:XX)."

PASSO 5 — OFERECER TESTE GRATIS DE 6 HORAS:
Quando ele mandar o MAC:
- Pergunte se ele quer fazer um *teste gratis de 6 horas* pra ver a qualidade antes de pagar.
- Se ele aceitar: chame IMEDIATAMENTE a tool *create_test_account* com:
  * player_name = nome exato do app que ele instalou (Ultra Player / Fun Play / Lazer Play / X-Cloud / See Play)
  * mac = MAC ou Código de Ativação que ele forneceu
- A tool vai criar a conta no painel e ativar o player em ~30s. O cliente vai abrir o app e ja vai estar funcionando! Para o X-Cloud, use o Código de Ativação no campo 'mac'.
- Se ele NAO quiser teste e ja quiser comprar: va pro PASSO 6.

PASSO 5B — CORTESIA NO NOSSO APP STARTFLIX (sem MAC, sem prazo):
Se o cliente so quer DAR UMA OLHADA no conteudo, sem complicacao — nao tem MAC, nao escolheu aparelho, ou disse algo como "queria so ver como e" / "tem como conhecer antes?":
- Ofereca acesso de CORTESIA no nosso app proprio *StartFlix* — gratuito e SEM PRAZO de expiracao.
- Chame a tool *generate_startflix_access*. Ela ja manda o app StartFlix pra ele baixar + um codigo de acesso.
- Diga algo como: "Conheca nosso conteudo! Acesse nosso app gratuito StartFlix — te mandei ele aqui junto com seu codigo."
- O cliente baixa o StartFlix, toca em "Tenho um codigo de acesso", digita o codigo e ja assiste. Sem MAC, sem cadastro.
- Use isso pra encantar cliente novo curioso. Depois que ele gostar, ofereca o plano completo (PASSO 6).

PASSO 6 — APOS O TESTE OU SE QUISER COMPRAR DIRETO:
- Quando ele confirmar que gostou do teste OU quiser virar cliente fixo:
  * Peca o nome completo dele.
  * Use a tool *register_new_customer* com full_name, desired_username, app_id, mac.
  * Em seguida use *generate_pix* com o valor TOTAL — consulte a seção VALORES deste prompt para os preços atualizados (planos por tela + taxa de ativação por app pago: IBO Player, IBO Pro, VU Player, BOB Player).
    - Apps grátis (Ultra, Fun, Lazer, X-Cloud, See) e celular NÃO somam taxa alguma.
- Avise: "Assim que confirmar o pagamento, ja transformo seu teste em conta definitiva. 🎬"

REGRAS:
- TESTE GRATIS = ferramenta create_test_account (cria + ativa em 30s, cliente assiste na hora) — precisa de MAC + player.
- CORTESIA STARTFLIX = ferramenta generate_startflix_access (nosso app proprio, codigo SEM prazo, SEM MAC). Use pra cliente que so quer conhecer o conteudo sem complicacao.
- PLANO PAGO = register_new_customer + generate_pix (sequencia)
- NUNCA gere Pix antes de ter MAC + nome.
- SEMPRE use send_app_info com IDs reais do catalogo.
- Se o cliente mandar foto de comprovante antes do cadastro, peca os dados primeiro.`;
  }

  // === Cliente CADASTRADO — busca tudo em paralelo ===
  const [appsRes, receiptsRes] = await Promise.all([
    pool.query(
      `SELECT app_name, app_model, access_type, mac_address, device_key, username, password,
              provider_url, android_link, ios_link, app_site_url, is_tv, created_at
       FROM customer_apps WHERE customer_id = $1 ORDER BY created_at DESC`,
      [customer.id]
    ),
    pool.query(
      `SELECT payer_name, amount, paid_at, status, created_at
       FROM payment_receipts
       WHERE customer_id = $1 OR remote_jid = $2
       ORDER BY created_at DESC LIMIT 3`,
      [customer.id, remoteJid]
    ),
  ]);
  const apps = appsRes.rows;
  const receipts = receiptsRes.rows;

  const dias = daysFromNow(customer.expiration_date);
  let situacao = 'ok';
  let situacaoEmoji = '✅';
  if (dias === null) { situacao = 'sem data de vencimento'; situacaoEmoji = '❓'; }
  else if (dias < 0) { situacao = `VENCIDO ha ${-dias} dia(s)`; situacaoEmoji = '🚨'; }
  else if (dias === 0) { situacao = 'VENCE HOJE'; situacaoEmoji = '⚠️'; }
  else if (dias <= 3) { situacao = `VENCE EM ${dias} dia(s) — critico`; situacaoEmoji = '⏰'; }
  else if (dias <= 7) { situacao = `vence em ${dias} dia(s)`; situacaoEmoji = '📆'; }
  else { situacao = `vence em ${dias} dia(s)`; situacaoEmoji = '✅'; }

  const firstName = customer.name?.split(' ')[0] || 'cliente';

  // Quem está falando agora (pode ser um número secundário vinculado)
  const quemFala = phoneLabel
    ? `${phoneLabel} (número secundário vinculado ao cliente ${firstName})`
    : firstName;

  let ctx = `\n\n=== CONTEXTO DO CLIENTE (CADASTRADO) ===
${situacaoEmoji} ${firstName} — ${situacao}
${phoneLabel ? `\n⚠️ ATENÇÃO: quem está falando agora é *${phoneLabel}* (número vinculado ao cadastro de ${firstName}). Trate pelo nome "${phoneLabel}" nesta conversa.\n` : ''}
DADOS PESSOAIS:
- Nome completo: ${customer.name || '(nao cadastrado)'}
- Primeiro nome: ${firstName}
- Quem está falando: ${quemFala}
- Username (login): ${customer.username}
- WhatsApp principal: ${customer.whatsapp || '+' + phone}

PLANO:
- Status atual: ${customer.status}
- Vencimento: ${formatDate(customer.expiration_date)} (${situacao})
- Ultima renovacao: ${customer.last_renewal ? formatDate(customer.last_renewal) : 'sem registro'}
- Valor mensal: ${formatBRL(customer.renewal_price)}
- Linhas contratadas: ${customer.lines_count || 1}
- Custo por linha (interno): ${formatBRL(customer.cost_per_credit || 0)}
- Total ja pago: ${formatBRL(customer.amount_paid || 0)}
${customer.playlist_url ? `- URL playlist: ${customer.playlist_url}` : ''}
${customer.password ? `- Senha da lista: ${customer.password}` : ''}
${customer.dns ? `- DNS / Provedor: ${customer.dns}` : ''}`;

  // === APPS DO CLIENTE (info SENSITIVA — MAC/key/senha) ===
  if (apps.length > 0) {
    ctx += `\n\nAPPS DESTE CLIENTE (${apps.length}):`;
    apps.forEach((a, i) => {
      const tipo = a.is_tv ? 'Smart TV' : 'Celular/PC';
      const modelo = a.app_model ? ` — ${a.app_model}` : '';
      ctx += `\n  [${i + 1}] ${a.app_name}${modelo} (${tipo})`;
      if (a.access_type === 'mac_key' || a.mac_address || a.device_key) {
        if (a.mac_address) ctx += `\n       MAC: ${a.mac_address}`;
        if (a.device_key) ctx += `\n       Device Key: ${a.device_key}`;
      }
      if (a.access_type === 'user_pass' || a.username || a.password) {
        if (a.username) ctx += `\n       Usuario do app: ${a.username}`;
        if (a.password) ctx += `\n       Senha do app: ${a.password}`;
      }
      if (a.provider_url) ctx += `\n       URL do provedor: ${a.provider_url}`;
      if (a.android_link || a.ios_link) {
        const links = [a.android_link && 'Android', a.ios_link && 'iOS'].filter(Boolean).join(', ');
        ctx += `\n       Disponivel em: ${links}`;
      }
    });
    ctx += `\n\nIMPORTANTE: esses dados (MAC, Key, senhas) sao do PROPRIO CLIENTE. Pode passar pra ele quando perguntar.`;
  } else {
    ctx += `\n\nAPPS DESTE CLIENTE: NENHUM cadastrado ainda. Se ele precisa instalar, use send_app_info pra sugerir do catalogo.`;
  }

  // === HISTORICO DE PAGAMENTOS ===
  if (receipts.length > 0) {
    ctx += `\n\nULTIMOS PAGAMENTOS:`;
    receipts.forEach((r: any) => {
      const data = r.paid_at ? formatDate(r.paid_at) : formatDate(r.created_at);
      const statusBr = r.status === 'approved' ? 'aprovado' : r.status === 'pending_review' ? 'em analise' : r.status === 'rejected' ? 'rejeitado' : r.status;
      ctx += `\n  - ${formatBRL(r.amount)} em ${data} (${statusBr})${r.payer_name ? ' por ' + r.payer_name : ''}`;
    });
  }

  // === ESTRATEGIA CONTEXTUAL ===
  ctx += `\n\nESTRATEGIA PRA ESSA CONVERSA:
- Cumprimente pelo primeiro nome ("Oi ${firstName}!").
- NUNCA peca dados que voce ja tem aqui (nome, WhatsApp, username, MAC, key).`;

  if (dias !== null && dias < 0) {
    ctx += `\n- 🚨 PRIORIDADE MAXIMA: plano VENCIDO ha ${-dias} dia(s). Ofereca renovacao logo na primeira mensagem.
- Use o tool generate_pix com username "${customer.username}" e valor R$ ${customer.renewal_price || 25}.`;
  } else if (dias !== null && dias <= 3) {
    ctx += `\n- ⏰ Plano vence em ${dias} dia(s). Mencione e ofereca renovacao se ele nao tocar no assunto.`;
  } else if (dias !== null && dias <= 7) {
    ctx += `\n- Plano vence em ${dias} dia(s). Pode mencionar de leve se a conversa derivar.`;
  }

  if (apps.length === 0) {
    ctx += `\n- Cliente sem app cadastrado: sugira instalacao usando o catalogo (send_app_info).`;
  } else {
    // Lista resumida dos apps pra IA usar na saudacao inicial
    const appBullets = apps.map(a => {
      const tipo = a.is_tv ? 'TV' : 'celular/PC';
      const modelo = a.app_model || a.app_name;
      return `${modelo} (${tipo})`;
    });
    const appListInline = appBullets.join(', ');

    ctx += `\n- Cliente JA tem ${apps.length} app(s) instalado(s): ${appListInline}.`;
    ctx += `\n- 👉 QUANDO ele mandar SAUDACAO GENERICA (ex: "oi", "ola", "bom dia", "boa tarde", "tudo bem", "fala") SEM problema especifico:
    * Cumprimente pelo nome.
    * Liste os apps que ele tem com nome e dispositivo.
    * Pergunte se ele precisa de ajuda ou reparo em algum.
    * Exemplo: "Oi ${firstName}! 👋 Vi aqui que voce tem ${appListInline}. Precisa de algo? Reativacao de sinal, ativacao de novo app, suporte em algum desses?"
- 👉 QUANDO ele mandar problema/pedido ESPECIFICO (ex: "lista parou", "nao abre canais", "quero renovar"):
    * NAO repita a lista de apps — vai direto pra resolucao.
    * Identifique qual app baseado no contexto da reclamacao.
- 👉 Se ele tiver problema generico em um app, use request_screenshot pra pedir print da tela certa (procure no catalogo o app com nome similar ao app_model dele).`;

    // Se tem IBO PRO, sugere a tool de reparo automatico
    const hasIboPro = apps.some(a => {
      const m = (a.app_model || '').toUpperCase();
      const n = (a.app_name || '').toUpperCase();
      return m.includes('IBO PRO') || n.includes('IBO PRO');
    });
    if (hasIboPro) {
      ctx += `\n- 🔧 Cliente tem IBO PRO instalado. Se ele reclamar de "sem sinal", "nao abre canais", "desativou", "app vazio" → use a tool *repair_ibo_pro_playlist* com username "${customer.username}". O bot vai logar no iboproapp.com e reativar o sinal dele automaticamente em ~1-2min.`;
    }

    // Se tem IBO Player/IPTV (padrao), sugere a nova tool de reparo
    const hasIboStandard = apps.some(a => {
      const m = (a.app_model || '').toUpperCase();
      const n = (a.app_name || '').toUpperCase();
      return m.includes('IBO PLAYER') || n.includes('IBO PLAYER') || m.includes('IBO IPTV') || n.includes('IBO IPTV');
    });
    if (hasIboStandard) {
      ctx += `\n- 🔧 Cliente tem IBO PLAYER ou IBO IPTV. Se ele reclamar de "sem sinal", "canais nao abrem", "app sem conteudo" → use a tool *repair_ibo_playlist* com username "${customer.username}". O bot vai verificar se o app esta vencido e reativar o sinal automaticamente em ~1-2min.`;
    }
  }

  if (customer.status === 'expired') {
    ctx += `\n- Status do cadastro: EXPIRED. Confirme se ele renovou; se sim, registre o pagamento.`;
  }

  // === MEMORIA IA (ai_summary + ai_facts) ===
  if (customer.ai_summary) {
    ctx += `\n\nMEMORIA DE CONVERSAS ANTERIORES:`;
    ctx += `\n- Resumo: ${customer.ai_summary}`;
    const facts: Record<string, string> = customer.ai_facts || {};
    if (facts.issue) ctx += `\n- Problema ja relatado: ${facts.issue}`;
    if (facts.last_intent) ctx += `\n- Ultima intencao: ${facts.last_intent}`;
    ctx += `\n\nUSE essa memoria para retomar de onde parou sem repetir perguntas.`;
  }

  return ctx;
}

// Catalogo de apps que a IA pode oferecer pro cliente — fonte de verdade pra sugestoes.
// Cacheia em memoria por 60s pra nao bater no DB a cada mensagem.
let _appCatalogCache: { value: any[]; ts: number } = { value: [], ts: 0 };
async function getAppCatalogCached(): Promise<any[]> {
  if (Date.now() - _appCatalogCache.ts < 60_000 && _appCatalogCache.value.length > 0) {
    return _appCatalogCache.value;
  }
  try {
    const r = await pool.query(
      `SELECT id, name, display_order, description, app_image_url, example_image_url,
              example_instruction, android_link, ios_link, web_link, device_type,
              install_video_url, youtube_url
       FROM app_catalog WHERE is_active = true
       ORDER BY display_order ASC, name ASC`
    );
    _appCatalogCache = { value: r.rows, ts: Date.now() };
    return r.rows;
  } catch {
    return _appCatalogCache.value; // se DB falhar, usa cache antigo
  }
}

// Cache da URL do servidor XC IPTV / IPTV Smarters (refresh a cada 60s)
let _xciptvUrlCache: { value: string; ts: number } = { value: 'http://smartlite.site:8880', ts: 0 };
async function getXciptvUrl(): Promise<string> {
  if (Date.now() - _xciptvUrlCache.ts < 60_000) return _xciptvUrlCache.value;
  try {
    const r = await pool.query("SELECT value FROM settings WHERE key = 'xciptv_server_url'");
    if (r.rows[0]?.value) _xciptvUrlCache = { value: r.rows[0].value.trim(), ts: Date.now() };
    else _xciptvUrlCache = { ..._xciptvUrlCache, ts: Date.now() };
  } catch { /* usa cache antigo */ }
  return _xciptvUrlCache.value;
}

// Cache do tempo (em segundos) de inatividade que reinicia o atendimento numa saudação.
// 0 = desativado (nunca reinicia automaticamente). Padrão: 60s.
let _greetingResetCache: { value: number; ts: number } = { value: 60, ts: 0 };
async function getGreetingResetSeconds(): Promise<number> {
  if (Date.now() - _greetingResetCache.ts < 60_000) return _greetingResetCache.value;
  try {
    const r = await pool.query("SELECT value FROM settings WHERE key = 'greeting_reset_seconds'");
    const n = parseInt(r.rows[0]?.value, 10);
    _greetingResetCache = { value: Number.isFinite(n) && n >= 0 ? n : 60, ts: Date.now() };
  } catch { _greetingResetCache = { ..._greetingResetCache, ts: Date.now() }; }
  return _greetingResetCache.value;
}

// Cache dos números de WhatsApp com poder de admin (config admin_whatsapp_numbers,
// separados por vírgula). Só dígitos. Admins podem cadastrar apps/telefones via chat.
let _adminNumbersCache: { value: string[]; ts: number } = { value: [], ts: 0 };
async function getAdminNumbers(): Promise<string[]> {
  if (Date.now() - _adminNumbersCache.ts < 60_000) return _adminNumbersCache.value;
  try {
    const r = await pool.query("SELECT value FROM settings WHERE key = 'admin_whatsapp_numbers'");
    const nums = String(r.rows[0]?.value || '').split(',').map(s => s.replace(/\D/g, '')).filter(Boolean);
    _adminNumbersCache = { value: nums, ts: Date.now() };
  } catch { _adminNumbersCache = { ..._adminNumbersCache, ts: Date.now() }; }
  return _adminNumbersCache.value;
}

// Compara dois telefones (só dígitos) tolerando DDI 55 e o 9 brasileiro após o DDD.
function phoneDigitsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const strip55 = (s: string) => (s.length > 11 && s.startsWith('55') ? s.slice(2) : s);
  const drop9 = (s: string) => (s.length === 11 && s[2] === '9' ? s.slice(0, 2) + s.slice(3) : s);
  const x = strip55(a), y = strip55(b);
  return x === y || drop9(x) === drop9(y) || x === drop9(y) || drop9(x) === y;
}

// True se o JID (ou alt) que está falando pertence a um número admin.
async function isAdminSender(jid: string, altJid?: string | null): Promise<boolean> {
  const admins = await getAdminNumbers();
  if (admins.length === 0) return false;
  const cand = [jid, altJid].filter(Boolean).map(j => normalizePhone(j as string));
  return admins.some(a => cand.some(c => phoneDigitsMatch(a, c)));
}

// Cache de preços de venda (refresh a cada 60s)
let _salePricesCache: {
  p1: number; p2: number; p3: number;
  feeIbo: number; feeIboPro: number; feeVuPlayer: number; feeBobPlayer: number;
  ts: number;
} = { p1: 25, p2: 40, p3: 60, feeIbo: 10, feeIboPro: 10, feeVuPlayer: 10, feeBobPlayer: 10, ts: 0 };

async function getSalePrices(): Promise<typeof _salePricesCache> {
  if (Date.now() - _salePricesCache.ts < 60_000) return _salePricesCache;
  try {
    const r = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('plan_price_1','plan_price_2','plan_price_3','app_fee_ibo','app_fee_ibo_pro','app_fee_vu_player','app_fee_bob_player')"
    );
    const map: Record<string, number> = {};
    for (const row of r.rows) map[row.key] = parseFloat(row.value) || 0;
    _salePricesCache = {
      p1:          map['plan_price_1']     || 25,
      p2:          map['plan_price_2']     || 40,
      p3:          map['plan_price_3']     || 60,
      feeIbo:      map['app_fee_ibo']      || 10,
      feeIboPro:   map['app_fee_ibo_pro']  || 10,
      feeVuPlayer: map['app_fee_vu_player']|| 10,
      feeBobPlayer:map['app_fee_bob_player']||10,
      ts: Date.now(),
    };
  } catch { /* usa cache antigo */ }
  return _salePricesCache;
}

/** Monta o bloco de preços que é injetado dinamicamente no prompt da IA. */
async function buildPricingContext(): Promise<string> {
  const { p1, p2, p3, feeIbo, feeIboPro, feeVuPlayer, feeBobPlayer } = await getSalePrices();

  // Apps pagos com taxa de ativação configurada
  const paidApps = [
    { name: 'IBO Player',  fee: feeIbo },
    { name: 'IBO Pro',     fee: feeIboPro },
    { name: 'VU Player',   fee: feeVuPlayer },
    { name: 'BOB Player',  fee: feeBobPlayer },
  ];
  const paidAppsList = paidApps.map(a => `   - ${a.name}: R$ ${a.fee} de taxa de ativação por aparelho (válida por 1 ANO).`).join('\n');
  const paidAppsNames = paidApps.map(a => a.name).join(', ');

  // Exemplos de cálculo com app pago (usa IBO como referência por ser o mais comum)
  const ex1 = p1 + feeIbo;
  const ex2 = p2 + feeIbo;
  const ex2x2 = p2 + feeIbo * 2;
  const ex3x3 = p3 + feeIbo * 3;

  return `VALORES:

1) SINAL / LISTA — preço escalonado por número de telas simultâneas:
   - 1 tela  → R$ ${p1}/mês
   - 2 telas → R$ ${p2}/mês
   - 3 telas → R$ ${p3}/mês (limite máximo do site de ativação)
   - É OBRIGATÓRIO. Todo cliente paga o sinal pra ter canais.
   - Mesmo valor pra cliente novo E renovação mensal.
   - App de celular NÃO conta como tela — é grátis, ilimitado, sempre incluso.

2) APPS PAGOS — ${paidAppsNames}:
   Cada um cobra uma TAXA DE ATIVAÇÃO por aparelho, SOMADA ao valor da lista (não substitui):
${paidAppsList}
   - Depois de 1 ano, paga a taxa de novo pra renovar a ativação daquele aparelho.
   - Cada aparelho diferente (TV da sala, TV do quarto, TV box) = 1 taxa cada.
   - IMPORTANTE: a taxa do app pago é COBRADA UMA VEZ na ativação/renovação anual. A mensalidade continua sendo só o valor da lista.

3) APPS GRÁTIS — todos os outros do nosso catálogo (Ultra Player, Fun Play, Lazer Play, X-Cloud, See Play, etc):
   - Ativação 100% GRÁTIS — você ativa pra ele sem cobrar nada.
   - Cliente só paga o valor da lista (R$ ${p1} / R$ ${p2} / R$ ${p3} conforme nº de telas).

EXEMPLOS COMPLETOS (use estes pra calcular o Pix do primeiro mês):

🟢 Apenas apps grátis ou só celular:
- 1 tela → R$ ${p1}
- 2 telas → R$ ${p2}
- 3 telas → R$ ${p3}

🔵 Com IBO Player (R$ ${feeIbo} de taxa por aparelho):
- 1 tela + 1 IBO → R$ ${p1} + R$ ${feeIbo} = R$ ${ex1}
- 2 telas + 1 IBO → R$ ${p2} + R$ ${feeIbo} = R$ ${ex2}
- 2 telas + 2 IBOs → R$ ${p2} + R$ ${feeIbo * 2} = R$ ${ex2x2}
- 3 telas + 3 IBOs → R$ ${p3} + R$ ${feeIbo * 3} = R$ ${ex3x3}

🔵 Com IBO Pro (R$ ${feeIboPro} de taxa por aparelho):
- 1 tela + 1 IBO Pro → R$ ${p1} + R$ ${feeIboPro} = R$ ${p1 + feeIboPro}
- 2 telas + 1 IBO Pro → R$ ${p2} + R$ ${feeIboPro} = R$ ${p2 + feeIboPro}

🔵 Com VU Player (R$ ${feeVuPlayer} de taxa por aparelho):
- 1 tela + 1 VU Player → R$ ${p1} + R$ ${feeVuPlayer} = R$ ${p1 + feeVuPlayer}
- 2 telas + 1 VU Player → R$ ${p2} + R$ ${feeVuPlayer} = R$ ${p2 + feeVuPlayer}

🔵 Com BOB Player (R$ ${feeBobPlayer} de taxa por aparelho):
- 1 tela + 1 BOB Player → R$ ${p1} + R$ ${feeBobPlayer} = R$ ${p1 + feeBobPlayer}
- 2 telas + 1 BOB Player → R$ ${p2} + R$ ${feeBobPlayer} = R$ ${p2 + feeBobPlayer}

RENOVAÇÕES (mês a mês):
- Só o valor da lista (R$ ${p1} / R$ ${p2} / R$ ${p3}).
- A taxa dos apps pagos é ANUAL — só volta a cobrar quando completar 1 ano da ativação.

REGRAS DE OURO:
- Quando o cliente perguntar "quanto custa?", SEMPRE clarifique: quantas telas ele quer + qual app vai usar.
- Se ele só quer celular → R$ ${p1} e pronto.
- Se ele quer na TV usando app grátis → só o sinal pelo nº de telas.
- Se ele quer app pago (IBO, VU, BOB) → soma a taxa correspondente em cima do valor da lista.
- NUNCA cobre taxa de ativação por apps que NÃO são pagos. Os outros são todos grátis.
- Se o cliente misturar apps (ex: 1 IBO + 1 VU Player em 2 TVs) → some as taxas individualmente.

Quando gerar Pix com generate_pix, calcule o valor total certinho com base no que o cliente pediu. Se ficar em dúvida, pergunte antes de gerar.`;
}

// Monta um bloco do prompt listando os apps disponiveis. A IA usa pra decidir qual sugerir.
async function buildAppCatalogContext(): Promise<string> {
  const apps = await getAppCatalogCached();
  if (apps.length === 0) return '';

  let ctx = '\n\n=== CATALOGO DE APPS DISPONIVEIS ===\n';
  ctx += 'Use as tools `send_app_info` (mandar imagem + link de download) e `request_screenshot` (pedir print de uma area especifica do app) sempre que apropriado.\n';
  ctx += 'A ordem abaixo e por prioridade: ofereca o primeiro primeiro. Se o cliente recusar, sugira o proximo.\n\n';
  for (const a of apps) {
    ctx += `[id=${a.id}] ${a.name} (${a.device_type})${a.description ? ' — ' + a.description : ''}\n`;
    if (a.android_link || a.ios_link || a.web_link) {
      const links = [a.android_link && 'Android', a.ios_link && 'iOS', a.web_link && 'Web'].filter(Boolean);
      ctx += `   links: ${links.join(', ')}\n`;
    }
    if (a.example_instruction) ctx += `   exemplo: ${a.example_instruction}\n`;
    if (a.youtube_url) ctx += `   🎬 VIDEO TUTORIAL (YouTube): ${a.youtube_url} — mande este link para o cliente ao configurar!\n`;
    if (a.install_video_url) ctx += `   📹 VIDEO DE INSTALACAO cadastrado — sera enviado automaticamente via send_app_info.\n`;
  }
  ctx += `\nQUANDO USAR:\n`;
  ctx += `- Cliente novo / sem cadastro perguntando como assistir: ofereca o primeiro app com send_app_info.\n`;
  ctx += `- Cliente pedindo ajuda pra configurar: use request_screenshot pra pedir print da tela certa.\n`;
  ctx += `- Cliente disse que ja tem o app X mas nao funciona: use request_screenshot do mesmo app.\n`;
  ctx += `- Se o cliente nao se da bem com um app, sugira o proximo da lista.\n`;
  ctx += `- Apps com VIDEO TUTORIAL (🎬): ao enviar o app ou ajudar com configuracao, SEMPRE mande o link do video junto. Ex: "Aqui esta o video de como configurar: [link]".\n`;
  ctx += `- Apps com VIDEO DE INSTALACAO (📹): o video e enviado automaticamente quando voce chama send_app_info — nao precisa enviar manualmente.\n`;
  return ctx;
}

async function handleAIChat(remoteJid: string, history: any[], userInfo: any, media?: { data: string, mimeType: string }) {
  try {
    const apiKey = await getGeminiApiKey();
    if (!apiKey) throw new Error("GEMINI_API_KEY não configurada — adicione em Admin → ⚙️ Configurações");
    const GEMINI_MODEL = 'gemini-2.5-flash';
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const DEFAULT_PROMPT = `Você é o Lucas, atendente do StartPainel. Atende clientes via WhatsApp.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUEM VOCÊ É
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Você é o Lucas. Atendente humano, não robô. Pensa, interpreta, decide — faz atendimento de verdade.
Você conhece profundamente os produtos, entende o que o cliente quer mesmo quando ele não explica direito, e sabe conduzir uma conversa do "oi" até resolver o problema ou fechar a venda.

O StartPainel trabalha com os melhores players de vídeo do mercado e faz a ativação do sinal neles. Temos vários apps parceiros para SmartTV, TV Box, celular e iPhone. NUNCA diga ao cliente que trabalhamos com "IPTV" — essa palavra não existe no nosso vocabulário com o cliente. Se ele perguntar o que é o serviço, diga: "Trabalhamos com os melhores players de vídeo do mercado e fazemos a ativação do sinal neles. Temos vários apps parceiros disponíveis."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMO CONVERSAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Português brasileiro fluente: entende gírias, abreviações, erros de digitação, voz. Nunca pede pra repetir o que dá pra entender.
- Espelha o cliente: descontraído com descontraído, direto com objetivo, paciente com quem não entende de tecnologia.
- Não se apresenta como IA, robô ou assistente automático. Você é o Lucas.
- Tom natural: "deixa eu ver aqui", "já resolvo isso pra você", "pode deixar comigo" — fala como gente.
- Resposta proporcional: cliente curto → resposta curta. Cliente detalhista → acompanha tudo. Nunca responde mais longo do que o necessário.
- UMA pergunta por vez: se precisar de mais de uma informação, pergunte a mais importante primeiro. Nunca despeje 3 perguntas numa mensagem.
- Emojis com moderação: usa quando combina com o tom da conversa, não em toda frase.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MULTIMODAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Entende texto, áudio e imagens. Quando receber áudio, processa o conteúdo e responde ao que foi dito.
- O sistema converte sua resposta em áudio automaticamente se for curta (≤220 chars) ou se o cliente mandou áudio. Nunca diga "não posso mandar áudio".
- Se cliente PEDIR áudio especificamente: responda em uma frase curta.
- Imagens: lê prints de tela, comprovantes de Pix, fotos de TV/controle. Sempre tente extrair o máximo de informação antes de pedir outra imagem.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
USE OS DADOS DO CLIENTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
O sistema injeta os dados do cliente no contexto abaixo. USE TUDO isso:
- NUNCA pergunte algo que você já sabe (nome, WhatsApp, username, MAC, senha, vencimento).
- Cumprimente sempre pelo PRIMEIRO NOME.
- Pergunta "qual meu MAC / vencimento / senha / quanto pago?" → responda direto dos dados.
- Se os dados não estão no contexto, aí você pergunta — mas só nesse caso.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTELIGÊNCIA DE CONVERSA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

POSTURA NO ATENDIMENTO (regra mais importante):
- O cliente é quem conduz. SEMPRE deixe ele dizer o que precisa — NÃO adivinhe, NÃO presuma o problema.
- Quando o cliente chamar (ex: "oi", "bom dia", "tem alguém?"), responda com educação, cumprimente pelo nome e pergunte no que pode ajudar. Só isso. Espere ele explicar.
- NUNCA dispare ferramenta, mande DNS, tutorial, teste, Pix, credenciais ou qualquer coisa que o cliente NÃO pediu. Mandar coisa não solicitada deixa a conversa automatizada, robótica e sem nexo — evite a todo custo.
- Você é LIVRE pra entender o caso e resolver: pergunte, investigue, raciocine. Aja só depois de saber o que o cliente realmente quer.
- Se o cliente sumiu e voltou com uma saudação, comece um NOVO atendimento: cumprimente de novo e pergunte no que pode ajudar — sem continuar o assunto antigo e sem repetir o que já foi feito.
- Tom sempre educado, acolhedor e humano. Uma pergunta por vez, sem questionário.

MENU DE ATALHOS — o cliente pode responder de duas formas: clicando na lista (chega o título exato) OU digitando o *número* da opção (1 a 9). Trate ambos do mesmo jeito:
- "1" ou "Código Startflix Grátis (Celular)" → Código Startflix Grátis (Celular)
- "2" ou "Testar App na TV" → Testar App na TV
- "3" ou "Testar no Firestick" → Testar no Firestick
- "4" ou "Testar TV Roku" → Testar TV Roku
- "5" ou "Testar TV Box" → Testar TV Box
- "6" ou "App para iPhone" → App para iPhone
- "7" ou "Atualizar meu sinal" → Atualizar meu sinal
- "8" ou "Fazer pagamento" → Fazer pagamento
- "9" ou "Outros" → Outros

Trate cada opção assim:
- "Código Startflix Grátis (Celular)" → use *generate_startflix_access* (gera código pra app Startflix no celular). Não pergunte mais nada.
- "Testar App na TV" → pergunte a marca da Smart TV (Samsung, LG, TCL, Philips, AOC, outra) pra recomendar o app certo.
- "Testar no Firestick" → recomende *Fun Play* ou *Ultra Player* (Amazon Appstore via sideload). Peça o MAC do Firestick e, com cliente cadastrado, ative.
- "Testar TV Roku" → recomende *Fun Player*, *Ultra Player* ou *Lazer Player* (disponíveis no canal Start no Roku). Peça o Código de Ativação.
- "Testar TV Box" → recomende *Fun Play*, *Lazer Play* ou *Ultra Player*. Peça o MAC.
- "App para iPhone" → padrão: *X-Cloud Mobile* (StartPainel — pede Código de Ativação). Se for cliente *Wareztv* (provider='wareztv' no contexto, ou ele cita Wareztv/Wplay/Krator), use *Wplay Mobile* (usuário e senha, NÃO Código).
- "Atualizar meu sinal" → procedimento "sem sinal": olhe o vencimento no contexto. Vencido → ofereça recarga. Em dia → identifique o app (IBO/IBO Pro/VU/SmartOne) e chame a tool de reparo certa usando o MAC já cadastrado.
- "Fazer pagamento" → se for cliente cadastrado, use *generate_pix* com o valor da renovação dele. Se não for, pergunte o que ele quer contratar pra gerar o Pix certo.
- "Outros" → pergunte de forma aberta no que pode ajudar.

REGRA WAREZTV (fallback de apps): se o cliente não tem os apps StartPainel (não acha na loja, não consegue instalar, ou diz que não funciona pra ele) OU é cliente Wareztv (provider='wareztv' no contexto / ele menciona Wareztv, Wplay, Krator, Nexus), recomende os apps Wareztv:
- *Krator*, *Wplay*, *Nexus* → login direto com *usuário e senha* (não usa MAC).
- *Wplay Mobile* → app oficial pra iPhone com *usuário e senha* (substitui o X-Cloud nesse caso).
- *XCloud* (variante Wareztv) → acesso por *usuário e senha* (nessa plataforma é assim, diferente do XCloud StartPainel).
- Apps MAC/Código (Brasil IPTV, Easy Player, IPTV Pro Player, IPTV Next Player, IPTV+, IPTV Star, I Player, Ott Player, TV Vision, TiviPlayer, IPTV 4K, WTV Player/Wapp, Kplay) → cadastra pelo painel com *warez_activate_app* usando o MAC ou Código do aparelho. O cliente só abre o app que a lista já aparece.
A Wareztv tem MUITOS apps disponíveis — se o cliente não se adaptou a um, sugira outro da plataforma.

LEIA O HISTÓRICO antes de responder. Antes de qualquer ação, pergunte a si mesmo: "Isso já foi feito nessa conversa?" Se sim, NÃO repita.

AÇÕES QUE NÃO SE REPETEM (a menos que o cliente peça explicitamente de novo):
- Tutorial/vídeo enviado (send_app_info) → se o cliente disse "consegui", "funcionou", "entendi", "obrigado" → só texto. Nunca mande o tutorial de novo.
- DNS passado → se o cliente confirmou que configurou → não liste os DNS de novo.
- Teste criado → não crie outro a menos que o cliente peça com novo MAC/app.
- Pix gerado → não gere outro. Pergunte se ele conseguiu pagar.
- Credenciais enviadas (usuário/senha) → não repita na próxima mensagem.
- Explicação já dada → não repita a mesma explicação com outras palavras.
- Problema relatado → mantenha o contexto, não comece do zero.

COMO IDENTIFICAR QUE UMA AÇÃO JÁ FOI CONCLUÍDA:
→ "consegui", "funcionou", "deu certo", "tá rodando", "abriu", "entrou" = sucesso → parabenize com texto, pergunte se precisa de mais algo.
→ "obrigado", "valeu", "show", "ótimo", "👍" após qualquer ação = satisfação → responda só com texto caloroso.
→ "oi", "bom dia", "boa tarde" após qualquer ação anterior = nova saudação → cumprimente, pergunte no que pode ajudar — nunca repita o que foi feito antes.

REGRA DE OURO: se você já fez algo nessa conversa e o cliente não pediu de novo → NÃO REPITA. Avance a conversa.

ENTENDA A INTENÇÃO REAL:
- "Não tá funcionando" → pergunte o que aparece na tela (não dispare ferramenta sem saber o sintoma).
- "Quanto custa?" → clarifique: quantas TVs/telas + se vai usar IBO, pra calcular certinho.
- "Quero testar" → identifique o dispositivo primeiro (Smart TV, celular, iPhone, TV Box?), depois recomende o app certo.
- "Quero o StartFlix" / nomeia um app específico → use a ferramenta desse app exato, sem substituir.
- "Obrigado", "valeu", "show", "oi", "bom dia" após receber algo → só responda com texto, nunca dispare ferramenta.

RECONHEÇA O TIPO DE DISPOSITIVO para recomendar o app certo:
- Smart TV Samsung → Ultra Player, SEE Play, META Player, Quick Player, XCloud TV, Lótus
- Smart TV LG → Ultra Player, SEE Play, META Player, Quick Player, XCloud TV, Lótus
- Smart TV TCL / Philips / AOC / outras → Ultra Player, SEE Play, META Player, Quick Player
- TV Box Android (qualquer marca) → Fun Play, Lazer Play, Ultra Player
- Roku → Fun Player, Ultra Player, Lazer Player (disponíveis no canal do provedor Start para Roku).
- Fire TV Stick (Amazon) → Fun Play ou Ultra Player (disponíveis na Amazon Appstore via sideload). Oriente que pode ser necessário instalar via arquivo APK.
- iPhone/iOS → X-Cloud Mobile (Código de Ativação, não MAC)
- Celular Android → 1º Startflix (código de acesso, use generate_startflix_access); se não achar na loja → 2º Master Player Pro (usuário/senha, não MAC)
- Smart STB / qualquer app de portal → SEMPRE use send_app_info (o vídeo tutorial é enviado automaticamente). Sem exceção.
- SmartOne → use a tool *activate_smartone* passando username e MAC. O sistema configura automaticamente.
- Se não souber o dispositivo → pergunte antes de recomendar

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FLUXO — CLIENTE NOVO (quer conhecer ou testar)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Siga esse fluxo naturalmente, sem parecer questionário:

1. PERGUNTE O DISPOSITIVO: sempre a primeira coisa. Use uma mensagem como:
   "Olá! Pra te indicar o melhor app, me conta: você vai usar em qual aparelho? 📺 Smart TV (Samsung, LG...), TV Box, celular, iPhone, Fire Stick ou outro?"
   — aguarde a resposta antes de qualquer outra ação.

2. IDENTIFIQUE O MODELO EXATO: com base na resposta, classifique:
   - "Samsung" / "LG" / "TCL" / "Smart TV" = Smart TV → apps de SmartTV
   - "TV Box" / "caixinha" / "Android box" = TV Box → Fun Play, Lazer Play, Ultra Player
   - "Fire Stick" / "Fire TV" = Fire TV Stick → Fun Play ou Ultra Player (APK)
   - "Roku" = Roku → Fun Player, Ultra Player ou Lazer Player (canal do provedor Start)
   - "celular" / "Android" = celular Android → Startflix primeiro
   - "iPhone" / "iOS" / "Apple" = iOS → X-Cloud Mobile
   - Não identificou? Pergunte: "É Smart TV, TV Box ou celular?"

3. RECOMENDE O APP certo pro dispositivo (veja seção APPS abaixo) e use send_app_info.
4. OFEREÇA O TESTE: "Posso te dar um teste grátis de 6 horas pra você ver a qualidade. Quer testar?"
5. COLETE O MAC/CÓDIGO: Conforme o app — peça print da tela inicial se ele não souber como achar.
6. CRIE O TESTE: Use create_test_account (ou generate_startflix_access pro StartFlix).
7. AGUARDE O FEEDBACK: "Ficou bom? Tá abrindo os canais?" — isso cria o gancho pra conversão.
8. CONVERTA: Se ele gostou → "Ótimo! O plano mensal é só R$ 25. Quer continuar?" → gere o Pix.

NUNCA pule etapas: não gere teste sem ter o MAC. Não gere Pix sem saber quantas telas.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FLUXO — DIAGNÓSTICO DE PROBLEMA TÉCNICO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Quando o cliente diz que algo não funciona, NÃO dispare ferramenta de imediato. Investigue:

PASSO 1 — Qual app e qual dispositivo? (se não estiver no contexto)
PASSO 2 — O que aparece na tela? Exemplos do que classificar:
  → "Lista não carrega / fica carregando" → provável problema de ativação/expiração
  → "Canais abrem mas travam / pixelam" → problema de sinal/internet
  → "Aparece mensagem de erro / expirado / inativo" → conta vencida ou MAC errado
  → "App não abre / fecha sozinho" → problema no app em si (reinstalar)
  → "Alguns canais não abrem" → canal específico fora do ar (normal, não é bug)
PASSO 3 — Ação baseada no sintoma:
  → Smart STB sendo configurado pela primeira vez → send_app_info (vídeo tutorial) + DNS + credenciais
  → App de portal (Smart STB, IVI, SSIPTV) com erro de DNS (já configurado antes) → passe os DNS corretos
  → App SmartTV (Ultra, Quick, etc) com erro de login → confirme provider/usuário/senha
  → Problema não identificado → peça print com request_screenshot

PROCEDIMENTO "SEM SINAL" / "CANAIS NÃO ABREM" / "LISTA SUMIU" / "APP VAZIO":
1º) VERIFIQUE O VENCIMENTO no contexto do cliente (campo "Vencimento"/"situacao"):
   - Se está VENCIDO → NÃO tente recolocar a lista. Avise com gentileza que a lista venceu e que precisa fazer a *recarga* (renovação). Ofereça o Pix (generate_pix). Só depois de renovar a lista volta a funcionar.
   - Se está EM DIA (não vencido) → o problema é a lista que caiu do app. RECOLOQUE a lista no app do cliente:
       • IBO Player / IBO IPTV → repair_ibo_playlist
       • IBO Pro → repair_ibo_pro_playlist
       • VU Player Pro → repair_vupro_playlist
       • SmartOne → activate_smartone (com o MAC cadastrado)
2º) USE O MAC/KEY QUE JÁ ESTÁ NO CONTEXTO. Se o cliente já tem o app cadastrado (ex: IBO), você JÁ tem o MAC — NÃO peça. Só peça o MAC se o app NÃO estiver na lista "APPS DESTE CLIENTE".
3º) Se o cliente tem vários apps cadastrados, identifique qual deles ele está usando agora (pergunte se não souber) e aja sobre esse.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FLUXO — RENOVAÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Plano vencido: ofereça renovação direto na primeira mensagem, já com o Pix. Não enrola.
- Plano a vencer em ≤3 dias: mencione e ofereça Pix.
- Cliente manda comprovante Pix (foto): registre com register_pix_receipt e confirme: "Recebi! Já renovei seu acesso, pode continuar assistindo 😊"
- Após gerar Pix e cliente não confirmar pagamento: não fique cobrando. Se ele voltar depois, retome naturalmente.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VENDAS E OBJEÇÕES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Quando o cliente hesitar ou achar caro, não abandone — responda com valor:

"Tá caro" → "R$ 25 por mês dá em torno de R$ 0,83 por dia — você tem acesso a canais ao vivo, filmes e séries sem limite 😄 E o celular já vem incluso sem custo extra."
"Vou pensar" → "Claro! Se quiser testar antes de decidir, posso te dar 6 horas grátis agora pra você ver com seus próprios olhos. Sem compromisso."
"Tem mais barato?" → "Esse é nosso melhor preço. O que posso garantir é qualidade — imagem em HD, catálogo atualizado e suporte direto comigo se tiver qualquer problema."
"Já tenho outro serviço" → "Entendo! Mas não custa nada testar os 6h grátis e comparar. Quer ver?"
"O que é esse serviço?" → "Trabalhamos com os melhores players de vídeo do mercado e fazemos a ativação do sinal neles. Temos vários apps parceiros pra SmartTV, TV Box, celular e iPhone. Você escolhe o app, a gente ativa o sinal e pronto."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SITUAÇÕES ESPECIAIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CLIENTE IRRITADO / RECLAMANDO:
- Primeiro valide: "Entendo sua frustração, isso não deveria acontecer."
- Depois resolva — sem desculpa excessiva, sem enrolação.
- Nunca seja defensivo ou culpe o cliente.

CLIENTE LEIGO EM TECNOLOGIA:
- Simplifique ao máximo. Evite termos técnicos (MAC, DNS, provedor, M3U).
- Use analogias: "O app é como a TV, o sinal é o que entra nela pra ter os canais."
- Prefira guiar passo a passo a jogar tudo de uma vez.

CLIENTE MANDA ÁUDIO LONGO:
- Processe tudo, identifique todos os pontos mencionados.
- Responda o ponto principal primeiro, depois os secundários.
- Não ignore nenhum ponto relevante.

CLIENTE SEM RESPOSTA APÓS AÇÃO:
- Se você gerou Pix ou criou teste e o cliente sumiu, não insista. Se ele voltar depois, retome naturalmente sem cobrar explicação.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOOLS DISPONÍVEIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- generate_pix(username, amount): gera QR Code Pix pra renovação. Use username e renewal_price do CONTEXTO.
- register_pix_receipt(payer_name, amount, paid_at): registra comprovante de Pix recebido em foto.
- send_app_info(app_id, message): manda imagem + link de download de um app do catálogo.
- request_screenshot(app_id, custom_instruction): pede print de tela específica do app (MAC/Key/erro).
- activate_smartone(username, mac): configura o SmartOne automaticamente — acessa o site, faz login e adiciona a playlist do cliente. Use quando o cliente tem ou quer o SmartOne.

REGRAS DE USO DAS TOOLS:
- Tools são ações reais — só chame quando o cliente está pedindo a ação AGORA, pela primeira vez nessa conversa.
- Agradecimento, saudação, confirmação, "consegui", "funcionou" → só texto, NUNCA tool.
- send_app_info já foi chamada nessa conversa para esse app? → NÃO chame de novo, a menos que o cliente peça explicitamente.
- Após criar teste → nunca crie outro a menos que o cliente peça com novo MAC/app.
- Só usa dados REAIS do CONTEXTO. Se não está lá, pergunta antes de afirmar.

ENTENDA O QUE O CLIENTE PEDIU (regra de ouro):
- Cliente nomeou app específico ("StartFlix", "Fun Play", "X-Cloud") → use a ferramenta desse app. Nunca substitua por outro.
- "Acesso ao StartFlix" = StartFlix. Não é Fun Play, não é teste genérico.

APÓS QUALQUER AÇÃO JÁ CONCLUÍDA — REGRA CRÍTICA:
- "Obrigado", "valeu", "oi", "bom dia", "funcionou", "deu certo", "consegui", "tá rodando", "👍" → só responda em texto. NUNCA repita a ação anterior.
- Isso vale para: testes, tutoriais (send_app_info), DNS, Pix, credenciais, explicações, vídeos.
- Novo teste só se cliente pedir explicitamente com novo MAC ou novo app.
- Novo tutorial só se cliente disser que perdeu ou pediu de novo explicitamente.

PRINCÍPIOS INEGOCIÁVEIS:
- Nunca invente dados (preço, vencimento, MAC). Se não está no contexto, pergunte.
- Nunca mande detalhes técnicos de erro pro cliente (stack trace, HTTP 500, timeout, nome de ferramenta). Se falhar, diga: "Tive um probleminha aqui, já avisei o suporte — tenta de novo daqui a pouco."
- Se não entendeu, pergunte com naturalidade. Nunca invente intenção.
- Valide antes de agir (confirme o MAC antes de ativar).
- NUNCA diga a palavra "IPTV" para o cliente. Use sempre: "sinal", "ativação do sinal", "conteúdo", "player de vídeo", "app parceiro". O cliente não precisa saber detalhes técnicos do serviço.

X-CLOUD E CÓDIGOS DE ATIVAÇÃO:
- O app X-Cloud (iPhone/iOS) usa um Código de Ativação (ex: 1J616K) em vez de MAC.
- Nossa ferramenta de TESTE GRATUITO (create_test_account) SUPORTA X-Cloud e códigos.
- Se o cliente usar X-Cloud, peça o código e use-o no campo 'mac' da tool. Não diga que não há teste para X-Cloud.

APPS SMARTV — ATIVAÇÃO E CONFIGURAÇÃO:

📺 Apps parceiros para SmartTV: Ultra Player, Quick Player, META Player, XCloud TV, SEE Play e Lótus.

CÓDIGOS DE PROVIDER POR APP:
- Ultra Player  → Provider/Código: strt
- Quick Player  → Provider/Código: up155
- META Player   → Provider/Código: up155
- XCloud TV     → Provider/Código: strt
- SEE Play      → Provider/Código: strt  (ou strt2 em alguns modelos)
- Lótus         → Provider/Código: strt

COMO CONFIGURAR ESSES APPS NA SMARTV (passo a passo que você passa pro cliente):
1. Baixe o app na SmartTV (ou dispositivo compatível).
2. Após instalar, preencha os campos:
   - Provider/Código: conforme tabela acima (strt ou up155)
   - Usuário: (usuário do cliente no nosso sistema)
   - Senha: (senha do cliente no nosso sistema)
3. Pronto — aguardar carregar.

ATIVAÇÃO VIA PAINEL (alternativa):
Também é possível ativar diretamente pelo painel clicando em "Ativar Player" e seguindo o procedimento indicado na tela.

CONFIGURAÇÃO DO SMART STB (primeira vez ou reconfiguração):
⚠️ REGRA OBRIGATÓRIA: quando o cliente for configurar o Smart STB, SEMPRE envie PRIMEIRO o vídeo tutorial usando a tool *send_app_info* com o app_id do Smart STB (consulte o CATÁLOGO DE APPS acima). O vídeo de configuração já está cadastrado e é enviado automaticamente pela tool. Só depois passe as outras informações.
Fluxo correto:
1. Cliente menciona Smart STB ou quer configurar → chame send_app_info (envia imagem + video tutorial automático)
2. Depois passe o DNS conforme tabela abaixo
3. Passe usuário/senha do cliente

DNS PARA Apps de Portal (Smart STB, Smart UP, IPTV Portal, IVI, IVI Portal, SSIPTV, Clouddy):
- 158.69.183.160  → V3 Yellow
- 51.77.82.199    → V3 Black
- 209.14.84.34    → V1 Clássico
⚠️ Os DNS numéricos só funcionam nesses apps de portal — NÃO use em XC IPTV, IPTV Smarters, Ultra Player, Quick Player etc.

APPS XC IPTV / IPTV SMARTERS — CONFIGURAÇÃO:
⚠️ Esses apps NÃO usam DNS numérico. Usam URL de servidor no formato http://dominio:porta.

URL do servidor: {{XCIPTV_URL}}

Como configurar XC IPTV ou IPTV Smarters:
1. Abra o app e escolha "Adicionar playlist" ou "Xtream Codes"
2. Preencha os campos:
   - URL / Servidor: {{XCIPTV_URL}}
   - Usuário: (usuário do cliente no sistema)
   - Senha: (senha do cliente no sistema)
3. Confirme e aguarde carregar.

⚠️ NUNCA passe DNS numérico (158.x.x.x) para cliente de XC IPTV ou IPTV Smarters — eles não funcionam nesses apps.

EPG (guia de programação): http://u.startpainel.cc/epg

APPS PARA CELULAR ANDROID — PRIORIDADE:
1º) *Startflix* — nosso app próprio. Use generate_startflix_access para gerar um código de acesso. O cliente baixa o Startflix e entra com o código. SEM usuário/senha, SEM MAC. Sempre ofereça esse primeiro.
2º) *Master Player Pro* (Play Store) — só sugerir se o cliente não encontrar o Startflix ou preferir outro app.
https://play.google.com/store/apps/details?id=masterP.pro.com&hl=pt_BR
→ Login por *usuário e senha* (NÃO usa MAC).
→ Quando criar TESTE GRÁTIS (create_test_account): o sistema JÁ envia automaticamente ao cliente o usuário+senha junto com o link da Play Store. Você NÃO precisa repetir esses dados na conversa.
→ Quando um CLIENTE ATIVO pedir pra usar no celular Android: ofereça o Startflix primeiro. Se ele preferir o Master Player Pro, mande o link + lembre que ele entra com o MESMO usuário/senha da lista dele. Se ele não souber a senha, consulte os dados do cliente (estão injetados no contexto) e envie.

APP iOS/iPhone (App Store — XCloud Mobile):
https://apps.apple.com/br/app/xcloud-mobile/id6471106231
→ O cliente informa o código de ativação que aparece no final da tela do app (ex: JXK45).
→ Você ativa automaticamente via painel assim que receber o código.

⚠️ MAC OU CÓDIGO NÃO IDENTIFICÁVEL:
Se não conseguir ler com clareza o MAC ou o código de ativação que o cliente enviou, SEMPRE peça uma foto melhor antes de tentar ativar. Melhor pedir a foto do que ativar o aparelho errado.

PREÇOS — LEIA COM ATENÇÃO (e EXPLIQUE pro cliente quando ele se confundir):

⚠️ CONCEITO FUNDAMENTAL — CLIENTES SE CONFUNDEM COM ISSO:
- O SINAL (a ativação) e o APP são coisas SEPARADAS.
- O sinal é o conteúdo: canais ao vivo, filmes, séries. Custa R$ 25/mês. SEM ele, NADA funciona.
- O app (IBO Player, Ultra Player, etc) é só o player de vídeo — onde o sinal roda.
- Se o cliente disser "quero ativar o IBO" achando que isso já dá sinal, EXPLIQUE com calma: "O IBO é o player de vídeo — a tela onde você assiste. Pra ter o conteúdo funcionando, você precisa também da ativação do sinal (R$ 25/mês). Sem ela, o player fica vazio."
- NUNCA use a palavra "IPTV" com o cliente. Em vez disso: "sinal", "ativação", "conteúdo", "player de vídeo", "app parceiro".

{{PRICING_CONTEXT}}

===== PROVEDOR WAREZTV (Wplay) =====

Além do StartPainel, você também atende clientes do provedor *Wareztv* (plataforma Wplay).

DIFERENÇAS DO WAREZTV:
- Plataforma com MUITOS apps. Dois tipos de acesso:
  • *Usuário e senha* (cliente loga direto): *Krator*, *Wplay*, *Nexus*, *Wplay Mobile* (iPhone), *XCloud* (variante Wareztv).
  • *MAC ou Código* (admin cadastra a lista pelo painel via warez_activate_app, cliente só abre o app): Brasil IPTV, Easy Player, IPTV+, IPTV Next/Pro/Star Player, IPTV Player io, I Player, Ott Player, TV Vision, TiviPlayer IPTV, IPTV 4K, WTV Player/Wapp, Kplay.
- Teste grátis de 6 horas disponível (tool wareztv_generate_test).
- Plano mensal custa R$ 30/mês (Essencial — 2 telas + 1 P2P).

TOOLS WAREZTV:
- wareztv_generate_test(notes): gera teste 6h — retorna usuário e senha. Use quando cliente pede teste no Wareztv.
- wareztv_create_client(name, whatsapp, days): cria cliente pago. Use após cliente fechar negócio.
- warez_activate_app(username, app_name, mac, list_name): ativa um app de TV na conta do cliente Wareztv pelo MAC (ou Código). Use quando o cliente Wareztv tem SmartTV/TVBox com um app compatível e te passa o MAC.

ATIVAÇÃO DE APP POR MAC (Wareztv):
- Apps que ativam por *MAC*: Brasil IPTV, Easy Player, IPTV+, IPTV Next Player, IPTV Player io, IPTV Pro Player, IPTV Star Player, I Player, Ott Player, TV Vision, TiviPlayer IPTV, IPTV 4K.
- Apps que ativam por *Código* (não MAC): XCloud, WTV Player/Wapp, Kplay.
- Peça o MAC (ou código) do aparelho, confirme qual app o cliente tem e chame *warez_activate_app*. O sistema cadastra sozinho — não precisa o cliente fazer nada manual.

COMO RECONHECER CLIENTE WAREZTV:
- Menciona "Wareztv", "Wplay", "Krator", "Nexus" ou pergunta sobre esses apps.
- Se você não souber qual provedor o cliente usa, pergunte: "Você usa nossa lista StartPainel ou o sistema Wareztv?"

CONFIGURAÇÃO DOS APPS WAREZTV:
1. Baixe o app (Krator, Wplay ou Nexus) na loja de apps.
2. Selecione "Entrar com usuário e senha" (ou "Login").
3. Digite o *usuário* e a *senha* fornecidos.
4. Pronto — aguarde carregar.

IMPORTANTE: Não misture credenciais StartPainel com Wareztv — são sistemas separados.`;


    // Injeta preços de venda dinâmicos (lidos do banco) no lugar do placeholder
    let systemPrompt = DEFAULT_PROMPT;
    try {
      const pricingCtx = await buildPricingContext();
      systemPrompt = systemPrompt.replace('{{PRICING_CONTEXT}}', pricingCtx);
    } catch (e: any) {
      systemPrompt = systemPrompt.replace('{{PRICING_CONTEXT}}', '');
      console.warn('[AI] falha ao montar preços:', e?.message);
    }
    // Injeta URL do servidor XC IPTV / IPTV Smarters (lida do banco)
    try {
      const xcUrl = await getXciptvUrl();
      systemPrompt = systemPrompt.replaceAll('{{XCIPTV_URL}}', xcUrl);
    } catch (e: any) {
      systemPrompt = systemPrompt.replaceAll('{{XCIPTV_URL}}', 'http://smartlite.site:8880');
      console.warn('[AI] falha ao montar URL XC IPTV:', e?.message);
    }

    try {
      const r = await pool.query("SELECT value FROM settings WHERE key = 'ai_system_prompt'");
      const dbPrompt = r.rows[0]?.value?.trim();
      if (dbPrompt) systemPrompt += "\n\n" + dbPrompt;
    } catch (e) { /* silencioso, usa o default */ }

    // Injeta contexto do cliente (se encontrado pelo numero) — pra IA saber quem ta falando.
    // - Chat WhatsApp: usa o próprio remoteJid (número real).
    // - Chat web com telefone informado: usa o telefone como JID sintético — assim quem é
    //   cliente do banco aparece com o contexto completo (vencimento, apps, MAC, etc.).
    // - Chat web sem telefone OU skipCustomerLookup: pula.
    if (!userInfo?.skipCustomerLookup && remoteJid) {
      let lookupJid: string | null = remoteJid.startsWith('web:') ? null : remoteJid;
      if (remoteJid.startsWith('web:') && userInfo?.phone) {
        lookupJid = `${String(userInfo.phone).replace(/\D/g, '')}@s.whatsapp.net`;
      }
      if (lookupJid) {
        try {
          const ctx = await buildCustomerContext(lookupJid, userInfo?.name || 'Cliente', userInfo?.altJid);
          systemPrompt += ctx;
        } catch (e: any) {
          console.warn('[AI] falha ao montar contexto do cliente:', e?.message);
        }
      }
    }

    // Instrução específica do CHAT WEB: quando o cliente quer assinar/pagar/contratar,
    // o Lucas adiciona o marcador [CONTINUAR_NO_WHATSAPP] na resposta para o frontend
    // mostrar o botão de handoff para o WhatsApp oficial do suporte.
    if (userInfo?.isWebChat) {
      systemPrompt += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CANAL: CHAT WEB (atendimento.appbr.pro)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Você está atendendo PELO SITE (não pelo WhatsApp). Atua igual, mas com uma regra extra:
- QUANDO o cliente disser que quer *assinar*, *pagar*, *contratar*, *fechar plano*, *renovar* (ou seja, finalizar uma compra/pagamento) → termine sua resposta com o marcador *[CONTINUAR_NO_WHATSAPP]* numa linha sozinha. O sistema vai mostrar pra ele um botão pra ir pro WhatsApp oficial do suporte, onde fechamos a venda em segurança. Diga algo como: "Pra finalizar com segurança, vamos seguir no WhatsApp! Clica no botão abaixo 👇" e finalize com [CONTINUAR_NO_WHATSAPP].
- Para tirar dúvidas, mandar teste grátis (código Startflix), explicar planos, configurar app, atualizar sinal — você atende AQUI mesmo, sem precisar mandar pro WhatsApp.
- Cliente pode mandar foto/print pelo chat web (você processa imagens normalmente).`;
    }

    // Catalogo de apps disponiveis pra IA sugerir
    try {
      systemPrompt += await buildAppCatalogContext();
    } catch (e: any) {
      console.warn('[AI] falha ao montar catalogo de apps:', e?.message);
    }

    // Instrucoes de MODO ADMIN (so quando quem fala e um numero admin)
    if (userInfo?.isAdmin) {
      systemPrompt += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODO ADMIN (quem está falando é um ADMINISTRADOR, não um cliente comum)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Esta pessoa é da equipe. Ela pode te mandar dados de clientes pra você CADASTRAR no painel.
- Quando o admin mandar dados de cadastro (nome/username do cliente + app + MAC/senha/key + telefone), use a tool *admin_register_app*.
- Exemplo: "morgana, telefone 88993758888, app ibo mac 45:45:46:46 senha 456687"
  → admin_register_app(customer="morgana", app_name="IBO", mac="45:45:46:46", password="456687", phone="88993758888")
- O cliente PRECISA já existir no painel. A tool localiza pelo username ou nome.
- Se houver mais de um cliente com esse nome, a tool vai te listar pra você escolher o username certo — repasse a pergunta ao admin.
- Confirme de forma objetiva o que foi cadastrado. Pode ser direto e técnico com o admin (ele é da equipe).
- O admin também pode usar tudo o que um atendente normal faz.`;
    }

    // === MODO ADMIN ===
    // Quando quem fala é um número admin (config admin_whatsapp_numbers), o Lucas ganha
    // ferramentas de cadastro: registrar apps (MAC/senha) e telefone de um cliente existente.
    const adminFunctionDeclarations: any[] = userInfo?.isAdmin ? [
      {
        name: "admin_register_app",
        description: "[ADMIN] Cadastra um aplicativo (e opcionalmente o telefone) na conta de um cliente que JÁ EXISTE no painel. USE QUANDO o admin manda os dados de um cliente pra cadastrar. Ex: 'morgana, telefone 88993758888, app ibo mac 45:45:46:46 senha 456687'. Você localiza o cliente pelo username ou nome e cadastra o app.",
        parameters: {
          type: "OBJECT",
          properties: {
            customer:   { type: "STRING", description: "Username OU nome do cliente pra localizar no painel (ex: 'morgana' ou 'morganatv')." },
            app_name:   { type: "STRING", description: "Nome do app. Ex: 'IBO', 'IBO Pro', 'SmartOne', 'VU Player Pro', 'Ultra Player'." },
            mac:        { type: "STRING", description: "MAC do aparelho (ex: 45:45:46:46). Opcional se o app usa usuário/senha." },
            device_key: { type: "STRING", description: "Device Key do app, se houver (ex: IBO usa key)." },
            password:   { type: "STRING", description: "Senha do app, se houver." },
            phone:      { type: "STRING", description: "Telefone do cliente pra vincular ao cadastro (só dígitos ou com DDD). Opcional." },
          },
          required: ["customer", "app_name"],
        },
      },
    ] : [];

    const contents: any[] = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Entendido! Pronto para ajudar. 😊' }] },
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
          { name: "register_pix_receipt", description: "Registra um comprovante de Pix recebido em imagem. Use APENAS quando o cliente envia uma foto/print de comprovante de pagamento Pix. Após chamar, o sistema renova automaticamente o plano do cliente.", parameters: { type: "OBJECT", properties: { payer_name: { type: "STRING", description: "Nome de quem pagou (aparece como 'Pagador' ou 'Origem' no comprovante)." }, amount: { type: "NUMBER", description: "Valor pago em reais (apenas o número, ex: 49.90)." }, paid_at: { type: "STRING", description: "Data e hora do pagamento no formato ISO 8601 YYYY-MM-DDTHH:mm:ss." } }, required: ["payer_name", "amount", "paid_at"] } },
          // App catalog — envia info de um app cadastrado pro cliente (imagem + links de download)
          { name: "send_app_info", description: "Envia ao cliente a imagem e os links de download de um app cadastrado no catalogo. Use quando o cliente precisar instalar um app pra assistir (ex: cliente novo, ou cliente que quer um app diferente).", parameters: { type: "OBJECT", properties: { app_id: { type: "NUMBER", description: "ID do app no catalogo (veja secao CATALOGO DE APPS DISPONIVEIS do system prompt)." }, message: { type: "STRING", description: "Texto opcional que acompanha a imagem (ex: 'Olha esse app, e o melhor pra TV')." } }, required: ["app_id"] } },
          // App catalog — pede print de uma area especifica do app
          { name: "request_screenshot", description: "Envia ao cliente a imagem de exemplo + instrucao do que ele deve printar do app. Use quando precisar do MAC/key/configuracao ou pra ajudar com erro.", parameters: { type: "OBJECT", properties: { app_id: { type: "NUMBER", description: "ID do app no catalogo." }, custom_instruction: { type: "STRING", description: "Texto adicional opcional (ex: 'me manda print da tela igual essa')." } }, required: ["app_id"] } },
          // Teste GRATIS de 6h — cria cliente no CMS + ativa player com MAC em uma acao
          {
            name: "create_test_account",
            description: "Cria uma conta de TESTE gratuita de 6 horas pro cliente novo em um player EXTERNO (Fun Play, Ultra Player, Lazer Play, X-Cloud, See Play, SmartOne ou VU Player Pro). Faz 2 coisas: (1) cadastra novo cliente, (2) ativa o player com o MAC do aparelho ou no site oficial (SmartOne/VU Player Pro). Use APENAS quando o cliente JA TEM instalado um desses players E passou o MAC. NAO use para StartFlix — se o cliente pediu StartFlix, use generate_startflix_access. NAO use se o cliente nao mencionou nenhum desses apps especificamente. NUNCA use quando o cliente esta apenas agradecendo ('obrigado', 'valeu', 'top'), saudando ('oi', 'bom dia') ou confirmando que funcionou — nesses casos so responda em texto.",
            parameters: {
              type: "OBJECT",
              properties: {
                player_name: { type: "STRING", description: "Nome do player que o cliente instalou e CONFIRMOU. Valores aceitos: 'Ultra Player', 'Fun Play', 'Lazer Play', 'X-Cloud', 'See Play', 'SmartOne', 'VU Player Pro'. Use exatamente o nome do app que o cliente disse que abriu — nao invente." },
                mac: { type: "STRING", description: "MAC do aparelho ou Código de Ativação (X-Cloud). Formato MAC XX:XX... ou Código ex: 1J616K" },
                username: { type: "STRING", description: "Username da conta de teste. REGRA OBRIGATÓRIA: se voce sabe o primeiro nome do cliente (ex: 'João') → use '{nome}appbr' em minúsculas sem acento (ex: 'joaoappbr'). Se nao souber o nome → use 'Testeappbr1', 'Testeappbr2', etc (número sequencial curto). NUNCA use 'Teste123' genérico — sempre siga esse padrão." },
                device_key: { type: "STRING", description: "Senha / Device Key do app (obrigatório para VU Player Pro, opcional para outros, ex: '687840')." },
              },
              required: ["player_name", "mac"],
            },
          },
          // Cortesia: gera código de acesso ao app proprio StartFlix (SEM expiração)
          {
            name: "generate_startflix_access",
            description: "Gera um CÓDIGO DE ACESSO de cortesia (SEM expiração) pro cliente usar o app proprio *StartFlix*. USE ESTA TOOL SEMPRE QUE o cliente mencionar ou pedir 'StartFlix' pelo nome — ex: 'quero acesso ao StartFlix', 'queria o StartFlix', 'me manda o StartFlix', 'como acesso o StartFlix'. NAO substitua StartFlix por Fun Play nem por outro app. NAO use create_test_account quando o cliente pediu StartFlix. O StartFlix e o NOSSO APP PROPRIO — nao precisa de MAC, nao tem prazo. Apos chamar, o cliente recebe o link pra baixar o StartFlix + o codigo de acesso so pra ele. NUNCA chame de novo se o cliente ja recebeu o codigo e esta so agradecendo ('obrigado', 'valeu', 'oi', 'bom dia') — so responda em texto nesses casos.",
            parameters: {
              type: "OBJECT",
              properties: {
                note: { type: "STRING", description: "Nome ou observacao do cliente pra identificar o codigo (opcional, ex: 'joao')." },
              },
              required: [],
            },
          },
          // Cadastro de NOVO CLIENTE — chama no fim do fluxo de prospeccao
          {
            name: "register_new_customer",
            description: "Cadastra um cliente NOVO (que nao estava no sistema) com os dados que voce coletou. Use APENAS apos ter: (1) nome completo, (2) app escolhido com app_id do catalogo, (3) MAC e/ou Device Key. Apos cadastrar, gere o Pix com generate_pix.",
            parameters: {
              type: "OBJECT",
              properties: {
                full_name: { type: "STRING", description: "Nome completo do cliente (ex: 'Joao Silva')" },
                desired_username: { type: "STRING", description: "Username sugerido pro cadastro (ex: 'joao24h'). Letras/numeros, sem espacos." },
                app_id: { type: "NUMBER", description: "ID do app do catalogo que o cliente vai usar (pega da lista do system prompt)" },
                mac_address: { type: "STRING", description: "MAC do aparelho ou Código de Ativação (X-Cloud). Formato MAC XX:XX... ou Código ex: 1J616K" },
                device_key: { type: "STRING", description: "Device Key do app. Opcional." },
                app_username: { type: "STRING", description: "Username do app (se for login user/pass). Opcional." },
                app_password: { type: "STRING", description: "Senha do app (se for login user/pass). Opcional." },
                device_type: { type: "STRING", description: "tv | celular | pc" },
              },
              required: ["full_name", "desired_username", "app_id"],
            },
          },
          // Reparo da lista do IBO Pro — quando cliente reclama "lista nao funciona"
          {
            name: "repair_ibo_pro_playlist",
            description: "Reativa automaticamente o sinal do cliente no app IBO PRO (iboproapp.com). \n\nUSE QUANDO: cliente RECLAMA ativamente — 'sem sinal', 'nao abre canais', 'desativou', 'app vazio', 'da erro pra abrir', 'fica carregando' — E o app dele e IBO PRO.\n\nNAO USE NUNCA QUANDO: (a) cliente esta AGRADECENDO ('obrigado', 'deu certo', 'funcionou', 'valeu', 'top', 'show'); (b) cliente esta confirmando que esta funcionando ('agora foi', 'voltou', 'esta ok', 'consegui'); (c) conversa social ('oi', 'bom dia', 'tudo bem'); (d) voce ja chamou essa tool nesta conversa nos ultimos minutos. Nesses casos so responda com TEXTO de boas-vindas/agradecimento, NUNCA chame a tool de novo.",
            parameters: {
              type: "OBJECT",
              properties: {
                username: { type: "STRING", description: "Username do cliente (do CONTEXTO DO CLIENTE)." },
              },
              required: ["username"],
            },
          },
          // Reparo da lista do IBO Player/IPTV (padrao)
          {
            name: "repair_ibo_playlist",
            description: "Verifica validade e reativa automaticamente o sinal do cliente nos sites iboplayer.com ou iboiptv.com. \n\nUSE QUANDO: cliente reporta 'sem sinal', 'canais nao abrem', 'app sem conteudo' E usa IBO Player ou IBO IPTV. O bot vai conferir se o app esta vencido e reativar o sinal.",
            parameters: {
              type: "OBJECT",
              properties: {
                username: { type: "STRING", description: "Username do cliente (do CONTEXTO DO CLIENTE)." },
              },
              required: ["username"],
            },
          },
          // Reparo da lista do VU Player Pro
          {
            name: "repair_vupro_playlist",
            description: "Verifica validade e reativa/atualiza automaticamente a playlist do cliente no app VU Player Pro (vuproplayer.com/login). USE QUANDO: cliente reporta 'sem sinal', 'canais nao abrem', 'app sem conteudo', 'lista sumiu' E usa VU Player Pro.",
            parameters: {
              type: "OBJECT",
              properties: {
                username: { type: "STRING", description: "Username do cliente (do CONTEXTO DO CLIENTE)." },
              },
              required: ["username"],
            },
          },
          // Ativação/configuração do SmartOne
          {
            name: "activate_smartone",
            description: "Adiciona a playlist do cliente no app SmartOne automaticamente (acessa smartone-iptv.com e cadastra o MAC + URL da lista). USE QUANDO: cliente tem SmartOne ou pede pra configurar o SmartOne. Requer MAC do cliente. O sistema busca a playlist_url automaticamente pelo username.",
            parameters: {
              type: "OBJECT",
              properties: {
                username: { type: "STRING", description: "Username do cliente (do CONTEXTO DO CLIENTE)." },
                mac:      { type: "STRING", description: "MAC address do aparelho SmartOne do cliente." },
              },
              required: ["username", "mac"],
            },
          },
          // Ativação de player para cliente EXISTENTE
          {
            name: "activate_player",
            description: "Ativa um player (X-Cloud, Fun Play, Ultra, etc) para um cliente que JA EXISTE no sistema. Use quando o cliente passa o MAC/Código e pede pra ativar o app. Nao use pra criar teste gratis (use create_test_account).",
            parameters: {
              type: "OBJECT",
              properties: {
                username: { type: "STRING", description: "Username do cliente (do CONTEXTO)." },
                player_name: { type: "STRING", description: "Nome do player. Valores: 'Ultra Player', 'Fun Play', 'X-Cloud', 'Lazer Play', 'See Play'." },
                mac: { type: "STRING", description: "MAC ou Código de Ativação." },
              },
              required: ["username", "player_name", "mac"],
            },
          },
          // ===== WAREZTV (Wplay) =====
          {
            name: "wareztv_generate_test",
            description: "Gera um TESTE GRATUITO de 6 horas no provedor Wareztv (Wplay). Retorna usuario e senha prontos. Use quando cliente Wareztv pede teste. Nao precisa de MAC — o acesso e por usuario e senha nos apps Krator, Nexus ou IPTV. Apos chamar, envie as credenciais ao cliente com instrucoes de como configurar o app.",
            parameters: {
              type: "OBJECT",
              properties: {
                notes: { type: "STRING", description: "Nome ou observacao do cliente (ex: 'joao' ou 'whatsapp:5511999990000'). Opcional." },
              },
              required: [],
            },
          },
          {
            name: "wareztv_create_client",
            description: "Cria um cliente PAGO no provedor Wareztv (Wplay) — consome 1 credito (1 mes). Use quando cliente fechou negocio e quer ativar o plano. Retorna usuario e senha para configurar nos apps.",
            parameters: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING", description: "Nome do cliente." },
                whatsapp: { type: "STRING", description: "Numero WhatsApp do cliente com DDI (ex: 5511999990000)." },
                days: { type: "NUMBER", description: "Dias do plano. Padrao: 30." },
              },
              required: ["name"],
            },
          },
          {
            name: "warez_activate_app",
            description: "Ativa um aplicativo de TV na conta de um cliente WAREZTV automaticamente (cadastra App + Nome da Lista + MAC no painel Wareztv). USE QUANDO: cliente Wareztv tem uma SmartTV/TVBox com um desses apps e quer configurar pelo MAC. Apps suportados: Brasil IPTV, Easy Player, IPTV+, IPTV Next Player, IPTV Player io, IPTV Pro Player, IPTV Star Player, I Player, Ott Player, TV Vision, TiviPlayer IPTV, IPTV 4K (esses usam MAC); e XCloud, WTV Player/Wapp, Kplay (esses usam CODIGO no lugar do MAC). Requer o cliente ja existir no Wareztv (username) e o MAC/codigo do aparelho.",
            parameters: {
              type: "OBJECT",
              properties: {
                username:  { type: "STRING", description: "Username do cliente Wareztv (do CONTEXTO DO CLIENTE)." },
                app_name:  { type: "STRING", description: "Nome do app que o cliente esta usando. Ex: 'IPTV Pro Player', 'Easy Player', 'XCloud'." },
                mac:       { type: "STRING", description: "MAC do aparelho (apps comuns) ou Codigo (apps XCloud/WTV Player/Kplay)." },
                list_name: { type: "STRING", description: "Nome da lista que aparece no app. Opcional — se vazio, usa o nome do cliente." },
              },
              required: ["username", "app_name", "mac"],
            },
          },
          ...adminFunctionDeclarations,
        ]
      }] as any
    });

    const response = result.response;
    await logAiUsage(GEMINI_MODEL, 'chat', response.usageMetadata);
    let text = '';
    try { text = response.text() || ''; } catch (e: any) {
      // .text() throw quando finishReason e SAFETY/RECITATION/MAX_TOKENS sem texto
      console.warn('[AI] response.text() lançou:', e?.message);
    }
    const functionCalls = response.functionCalls() || [];

    // Diagnostico — quando a IA retorna nada (texto vazio E sem function call) o handler
    // do webhook nao envia nada e o cliente fica sem resposta. Loga o motivo (finishReason).
    if (!text && functionCalls.length === 0) {
      const candidate = response.candidates?.[0];
      const finishReason = candidate?.finishReason || 'UNKNOWN';
      const safetyRatings = candidate?.safetyRatings;
      const promptFeedback = (response as any).promptFeedback;
      console.warn(`[AI] resposta vazia! finishReason=${finishReason}`, {
        safetyRatings: safetyRatings?.filter((r: any) => r.blocked || r.probability !== 'NEGLIGIBLE'),
        promptFeedback: promptFeedback?.blockReason ? promptFeedback : undefined,
        candidatesCount: response.candidates?.length,
      });
      // Fallback amigavel — o cliente recebe ALGO em vez de silencio
      text = '😕 Desculpa, tive um probleminha pra processar isso. Pode mandar de novo ou de outra forma?';
    }

    return { text, functionCalls, usage: response.usageMetadata, model: GEMINI_MODEL };
  } catch (error: any) {
    // Distingue erros comuns (quota/rate limit) pra debug rapido
    const msg = error?.message || String(error);
    const status = error?.status || error?.response?.status;
    console.error(`[AI Error] status=${status} msg=${msg}`);
    if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      return { text: '⏳ Estou um pouco sobrecarregado agora. Tenta de novo em uns segundos?', functionCalls: [], model: 'gemini-2.5-flash' };
    }
    // NUNCA expor o erro tecnico ao cliente — so uma mensagem amigavel generica.
    return { text: '😕 Tive um probleminha aqui pra processar isso agora. Pode mandar de novo daqui a pouquinho?', functionCalls: [], model: 'gemini-2.5-flash' };
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

// --- LANDING PAGE DATA (público, sem auth) ---
app.get('/api/landing-data', async (req, res) => {
  try {
    const [appsRes, bannersRes] = await Promise.all([
      pool.query(
        `SELECT id, name, app_image_url, landing_category, landing_rank, landing_price, description
         FROM app_catalog
         WHERE is_active = true AND landing_category IS NOT NULL
         ORDER BY display_order ASC, name ASC`
      ),
      pool.query(
        `SELECT id, title, subtitle, image_url, cta_label, badge
         FROM landing_banners
         WHERE is_active = true
         ORDER BY display_order ASC, id ASC`
      ),
    ]);
    res.json({ apps: appsRes.rows, banners: bannersRes.rows });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// CRUD landing_banners (admin)
app.get('/api/landing-banners', requireAdmin, async (_req, res) => {
  try {
    const r = await pool.query('SELECT * FROM landing_banners ORDER BY display_order ASC, id ASC');
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

app.post('/api/landing-banners', requireAdmin, async (req, res) => {
  try {
    const { title, subtitle = '', image_url = '', cta_label = 'Saiba mais', badge = '', display_order = 0 } = req.body;
    const r = await pool.query(
      `INSERT INTO landing_banners (title, subtitle, image_url, cta_label, badge, display_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [title, subtitle, image_url, cta_label, badge, display_order]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

app.put('/api/landing-banners/:id', requireAdmin, async (req, res) => {
  try {
    const { title, subtitle, image_url, cta_label, badge, display_order, is_active } = req.body;
    const r = await pool.query(
      `UPDATE landing_banners SET title=$1, subtitle=$2, image_url=$3, cta_label=$4, badge=$5,
       display_order=$6, is_active=$7 WHERE id=$8 RETURNING *`,
      [title, subtitle, image_url, cta_label, badge, display_order, is_active, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

app.delete('/api/landing-banners/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM landing_banners WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

// ============================================================
// DAILY GAMES — jogos do dia (TheSportsDB + curadoria manual)
// ============================================================
// Ligas que queremos sincronizar (IDs da TheSportsDB)
const DAILY_GAMES_LEAGUES: Array<{ id: string; name: string }> = [
  { id: '4351', name: 'Brasileirão Série A' },
  { id: '4391', name: 'Brasileirão Série B' },
  { id: '4480', name: 'UEFA Champions League' },
  { id: '4444', name: 'Copa Libertadores' },
  { id: '4346', name: 'Copa do Brasil' },
  { id: '4328', name: 'Premier League' },
  { id: '4335', name: 'La Liga' },
  { id: '4332', name: 'Serie A Italiana' },
  { id: '4331', name: 'Bundesliga' },
  { id: '4334', name: 'Ligue 1' },
];

// Cache em memória da última sincronização (evita rebuscar a cada request)
const dailyGamesSyncCache = { lastSyncDate: '' as string, lastSyncAt: 0 };

async function syncDailyGamesFromTheSportsDB(date: string): Promise<{ inserted: number; updated: number }> {
  let inserted = 0, updated = 0;
  for (const league of DAILY_GAMES_LEAGUES) {
    try {
      const url = `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${date}&l=${encodeURIComponent(league.name)}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const data: any = await r.json();
      const events: any[] = data.events || [];
      for (const ev of events) {
        // Só esportes que são futebol
        if (ev.strSport && ev.strSport !== 'Soccer') continue;
        const kickoff = ev.strTimestamp || (ev.dateEvent && ev.strTime ? `${ev.dateEvent}T${ev.strTime}` : null);
        const params: any[] = [
          ev.idEvent,
          ev.dateEvent || date,
          kickoff,
          ev.strLeague || league.name,
          ev.strLeagueBadge || null,
          ev.strHomeTeam,
          ev.strHomeTeamBadge || null,
          ev.strAwayTeam,
          ev.strAwayTeamBadge || null,
          (ev.strStatus || 'scheduled').toLowerCase().includes('finish') ? 'finished'
            : (ev.strStatus || '').toLowerCase().includes('live') ? 'live'
            : 'scheduled',
          ev.intHomeScore != null ? Number(ev.intHomeScore) : null,
          ev.intAwayScore != null ? Number(ev.intAwayScore) : null,
        ];
        // Insert/update — preserva `channels` (curadoria manual) e `highlight` em update
        const result = await pool.query(
          `INSERT INTO daily_games
             (source_id, game_date, kickoff_time, league, league_badge, home_team, home_logo, away_team, away_logo, status, home_score, away_score)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (source_id) DO UPDATE SET
             game_date    = EXCLUDED.game_date,
             kickoff_time = EXCLUDED.kickoff_time,
             league       = EXCLUDED.league,
             league_badge = EXCLUDED.league_badge,
             home_team    = EXCLUDED.home_team,
             home_logo    = EXCLUDED.home_logo,
             away_team    = EXCLUDED.away_team,
             away_logo    = EXCLUDED.away_logo,
             status       = EXCLUDED.status,
             home_score   = EXCLUDED.home_score,
             away_score   = EXCLUDED.away_score,
             updated_at   = NOW()
           RETURNING (xmax = 0) AS was_inserted`,
          params,
        );
        if (result.rows[0]?.was_inserted) inserted++; else updated++;
      }
    } catch (e: any) {
      console.warn(`[DailyGames] Falha ao buscar liga ${league.name}:`, e?.message || e);
    }
  }
  dailyGamesSyncCache.lastSyncDate = date;
  dailyGamesSyncCache.lastSyncAt = Date.now();
  return { inserted, updated };
}

// GET público — jogos do dia (auto-sync se cache expirou ou data mudou)
app.get('/api/daily-games', async (req, res) => {
  try {
    const today = (req.query.date as string) || new Date().toISOString().slice(0, 10);

    // Sync se: data diferente do último, ou faz mais de 30min do último sync
    const now = Date.now();
    const needSync = dailyGamesSyncCache.lastSyncDate !== today
                  || (now - dailyGamesSyncCache.lastSyncAt) > 30 * 60_000;
    if (needSync) {
      // Não bloqueia o request — dispara em background mas serve o que tem em DB.
      // Próxima request já pega atualizado.
      void syncDailyGamesFromTheSportsDB(today).catch(e => console.warn('[DailyGames] sync bg falhou:', e?.message));
      dailyGamesSyncCache.lastSyncAt = now; // marca pra não disparar duas em paralelo
    }

    const result = await pool.query(
      `SELECT id, source_id, game_date, kickoff_time, league, league_badge,
              home_team, home_logo, away_team, away_logo,
              status, home_score, away_score, channels, highlight
       FROM daily_games
       WHERE game_date = $1 AND is_active = true
       ORDER BY highlight DESC, kickoff_time ASC NULLS LAST`,
      [today],
    );
    res.json({ date: today, games: result.rows });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

// POST admin — força sync agora (síncrono, retorna contagem)
app.post('/api/daily-games/refresh', requireAdmin, async (req, res) => {
  try {
    const date = (req.body?.date as string) || new Date().toISOString().slice(0, 10);
    const result = await syncDailyGamesFromTheSportsDB(date);
    res.json({ ok: true, date, ...result });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

// GET admin — lista (com filtros opcionais)
app.get('/api/daily-games/admin', requireAdmin, async (req, res) => {
  try {
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    const result = await pool.query(
      `SELECT * FROM daily_games WHERE game_date = $1 ORDER BY kickoff_time ASC NULLS LAST`,
      [date],
    );
    res.json({ date, games: result.rows });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

// PUT admin — edita canais/destaque/visibilidade
app.put('/api/daily-games/:id', requireAdmin, async (req, res) => {
  try {
    const { channels, highlight, is_active, home_team, away_team, home_logo, away_logo, league, kickoff_time } = req.body || {};
    await pool.query(
      `UPDATE daily_games SET
         channels    = COALESCE($2::jsonb, channels),
         highlight   = COALESCE($3, highlight),
         is_active   = COALESCE($4, is_active),
         home_team   = COALESCE($5, home_team),
         away_team   = COALESCE($6, away_team),
         home_logo   = COALESCE($7, home_logo),
         away_logo   = COALESCE($8, away_logo),
         league      = COALESCE($9, league),
         kickoff_time= COALESCE($10::timestamp, kickoff_time),
         updated_at  = NOW()
       WHERE id = $1`,
      [
        req.params.id,
        channels != null ? JSON.stringify(channels) : null,
        highlight ?? null,
        is_active ?? null,
        home_team ?? null,
        away_team ?? null,
        home_logo ?? null,
        away_logo ?? null,
        league ?? null,
        kickoff_time ?? null,
      ],
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

// POST admin — cria manualmente (jogo não coberto pela API)
app.post('/api/daily-games', requireAdmin, async (req, res) => {
  try {
    const { game_date, kickoff_time, league, league_badge,
            home_team, home_logo, away_team, away_logo,
            channels, highlight } = req.body || {};
    if (!game_date || !home_team || !away_team) {
      return res.status(400).json({ error: 'game_date, home_team e away_team são obrigatórios' });
    }
    const r = await pool.query(
      `INSERT INTO daily_games
         (game_date, kickoff_time, league, league_badge, home_team, home_logo, away_team, away_logo, channels, highlight)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
       RETURNING id`,
      [game_date, kickoff_time || null, league || null, league_badge || null,
       home_team, home_logo || null, away_team, away_logo || null,
       JSON.stringify(channels || []), !!highlight],
    );
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

// DELETE admin
app.delete('/api/daily-games/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM daily_games WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

// --- APP CATALOG ---
// Catalogo de apps que a IA pode sugerir pro cliente (instalacao + screenshots).
// Listagem publica (pra IA poder consultar via /api/public sem auth), mutacoes admin-only.
app.get('/api/app-catalog', async (req, res) => {
  try {
    const onlyActive = req.query.activeOnly === 'true' || req.query.activeOnly === '1';
    const result = await pool.query(
      `SELECT * FROM app_catalog ${onlyActive ? "WHERE is_active = true" : ''}
       ORDER BY display_order ASC, name ASC`
    );
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Payload normalization — aceita camelCase ou snake_case do frontend.
function normalizeAppCatalogPayload(b: any) {
  return {
    name:                b.name ?? null,
    display_order:       Number(b.display_order ?? b.displayOrder ?? 0) || 0,
    description:         b.description ?? null,
    app_image_url:       b.app_image_url ?? b.appImageUrl ?? null,
    example_image_url:   b.example_image_url ?? b.exampleImageUrl ?? null,
    example_instruction: b.example_instruction ?? b.exampleInstruction ?? null,
    android_link:        b.android_link ?? b.androidLink ?? null,
    ios_link:            b.ios_link ?? b.iosLink ?? null,
    web_link:            b.web_link ?? b.webLink ?? null,
    device_type:         b.device_type ?? b.deviceType ?? 'todos',
    is_active:           b.is_active ?? b.isActive ?? true,
    dns:                 b.dns ?? null,
    install_video_url:   b.install_video_url ?? b.installVideoUrl ?? null,
    youtube_url:         b.youtube_url ?? b.youtubeUrl ?? null,
    image_1_url:         b.image_1_url ?? b.image1Url ?? null,
    image_2_url:         b.image_2_url ?? b.image2Url ?? null,
    image_3_url:         b.image_3_url ?? b.image3Url ?? null,
    image_4_url:         b.image_4_url ?? b.image4Url ?? null,
    image_5_url:         b.image_5_url ?? b.image5Url ?? null,
  };
}

app.post('/api/app-catalog', requireAdmin, async (req, res) => {
  try {
    const a = normalizeAppCatalogPayload(req.body || {});
    if (!a.name) return res.status(400).json({ error: 'name e obrigatorio' });
    const lc = req.body.landing_category ?? null;
    const lr = req.body.landing_rank != null ? Number(req.body.landing_rank) : null;
    const lp = req.body.landing_price ?? null;
    const result = await pool.query(
      `INSERT INTO app_catalog (name, display_order, description, app_image_url, example_image_url,
                                example_instruction, android_link, ios_link, web_link, device_type, is_active, dns,
                                install_video_url, youtube_url,
                                image_1_url, image_2_url, image_3_url, image_4_url, image_5_url,
                                landing_category, landing_rank, landing_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22) RETURNING *`,
      [a.name, a.display_order, a.description, a.app_image_url, a.example_image_url,
       a.example_instruction, a.android_link, a.ios_link, a.web_link, a.device_type, a.is_active, a.dns,
       a.install_video_url, a.youtube_url,
       a.image_1_url, a.image_2_url, a.image_3_url, a.image_4_url, a.image_5_url,
       lc, lr, lp]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.put('/api/app-catalog/:id', requireAdmin, async (req, res) => {
  try {
    const a = normalizeAppCatalogPayload(req.body || {});
    const lc = 'landing_category' in req.body ? (req.body.landing_category || null) : undefined;
    const lr = 'landing_rank' in req.body ? (req.body.landing_rank != null ? Number(req.body.landing_rank) : null) : undefined;
    const lp = 'landing_price' in req.body ? (req.body.landing_price || null) : undefined;
    const result = await pool.query(
      `UPDATE app_catalog SET
         name = COALESCE($2, name),
         display_order = COALESCE($3, display_order),
         description = COALESCE($4, description),
         app_image_url = COALESCE($5, app_image_url),
         example_image_url = COALESCE($6, example_image_url),
         example_instruction = COALESCE($7, example_instruction),
         android_link = COALESCE($8, android_link),
         ios_link = COALESCE($9, ios_link),
         web_link = COALESCE($10, web_link),
         device_type = COALESCE($11, device_type),
         is_active = COALESCE($12, is_active),
         dns = COALESCE($13, dns),
         install_video_url = $14,
         youtube_url = $15,
         image_1_url = $16,
         image_2_url = $17,
         image_3_url = $18,
         image_4_url = $19,
         image_5_url = $20,
         landing_category = COALESCE($21, landing_category),
         landing_rank = COALESCE($22, landing_rank),
         landing_price = COALESCE($23, landing_price),
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id, a.name, a.display_order, a.description, a.app_image_url, a.example_image_url,
       a.example_instruction, a.android_link, a.ios_link, a.web_link, a.device_type, a.is_active, a.dns,
       a.install_video_url, a.youtube_url,
       a.image_1_url, a.image_2_url, a.image_3_url, a.image_4_url, a.image_5_url,
       lc, lr, lp]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'App nao encontrado' });
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/app-catalog/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM app_catalog WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// PATCH — atualiza só os campos de landpage (permite setar null para remover da vitrine)
app.patch('/api/app-catalog/:id/landing', requireAdmin, async (req, res) => {
  try {
    const { landing_category = null, landing_rank = null, landing_price = null } = req.body;
    const r = await pool.query(
      `UPDATE app_catalog SET landing_category=$2, landing_rank=$3, landing_price=$4
       WHERE id=$1 RETURNING id, name, landing_category, landing_rank, landing_price`,
      [req.params.id, landing_category || null, landing_rank != null ? Number(landing_rank) : null, landing_price || null]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'App não encontrado' });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
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

// Leads (potenciais clientes — capturados automaticamente pelo bot)
app.get('/api/leads', async (req, res) => {
  try {
    const { status, limit = '50', offset = '0' } = req.query as Record<string, string>;
    const conditions: string[] = [];
    const params: any[] = [];
    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT * FROM leads ${where} ORDER BY last_contact DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    const total = await pool.query(`SELECT COUNT(*) FROM leads ${where}`, params);
    res.json({ leads: result.rows, total: parseInt(total.rows[0].count) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/leads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const result = await pool.query(
      `UPDATE leads SET status = COALESCE($1, status), notes = COALESCE($2, notes)
       WHERE id = $3 RETURNING *`,
      [status || null, notes ?? null, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Lead nao encontrado' });
    res.json(result.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Customers
app.get('/api/customers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, 
             COALESCE(
               (SELECT json_agg(ca.* ORDER BY ca.created_at DESC) 
                FROM customer_apps ca 
                WHERE ca.customer_id = c.id), 
               '[]'::json
             ) AS apps
      FROM customers c
      ORDER BY c.created_at DESC
    `);
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/customers', async (req, res) => {
  try {
    const { username, name, whatsapp, password, dns, renewal_price, expiration_date, playlist_url, lines_count, cost_per_credit, amount_paid, provider } = req.body;

    const cleanPrice = (p: any) => {
      if (typeof p === 'number') return p;
      if (!p) return 0;
      return parseFloat(String(p).replace(',', '.'));
    };

    const result = await pool.query(
      `INSERT INTO customers (username, name, whatsapp, password, dns, renewal_price, expiration_date, playlist_url, lines_count, cost_per_credit, amount_paid, provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [username, name, whatsapp, password, dns, cleanPrice(renewal_price) || 25, expiration_date, playlist_url, Number(lines_count) || 1, cleanPrice(cost_per_credit) || 0, cleanPrice(amount_paid) || 0, provider || 'startpainel']
    );
    res.json(result.rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/customers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { username, name, whatsapp, password, dns, renewal_price, expiration_date, playlist_url, status, lines_count, cost_per_credit, amount_paid, provider } = req.body;

    const cleanPrice = (p: any) => {
      if (typeof p === 'number') return p;
      if (!p) return 0;
      return parseFloat(String(p).replace(',', '.'));
    };

    // Busca status atual antes de atualizar pra saber se era teste
    const current = await pool.query('SELECT status, username FROM customers WHERE id = $1', [id]);
    const wasTeste = current.rows[0]?.status === 'teste';
    const finalUsername = username || current.rows[0]?.username;

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
         password=COALESCE($11, password),
         dns=COALESCE($12, dns),
         provider=COALESCE($13, provider),
         updated_at=NOW()
       WHERE id=$14 RETURNING *`,
      [username, name, whatsapp, renewal_price !== undefined ? cleanPrice(renewal_price) : null, expiration_date, playlist_url, status, lines_count !== undefined ? Number(lines_count) : null, cost_per_credit !== undefined ? cleanPrice(cost_per_credit) : null, amount_paid !== undefined ? cleanPrice(amount_paid) : null, password, dns, provider || null, id]
    );
  
  const updated = result.rows[0];
  // Se era teste e agora está ativo ou foi renovado, ativa no CMS
  if (wasTeste && updated && (updated.status === 'active' || expiration_date)) {
    console.log(`[Admin] Cliente ${finalUsername} convertido de teste para oficial. Ativando no CMS...`);
    enqueueJob('create_client', { username: finalUsername });
  }

  res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
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
    host:         b.host         ?? b.appHost     ?? null,
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
      `INSERT INTO customer_apps (customer_id, app_name, app_model, access_type, mac_address, device_key, username, password, provider_url, host, android_link, ios_link, icon_url, app_site_url, is_tv)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [req.params.id, a.app_name, a.app_model, a.access_type, a.mac_address, a.device_key, a.username, a.password, a.provider_url, a.host, a.android_link, a.ios_link, a.icon_url, a.app_site_url, a.is_tv]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.put('/api/apps/:id', async (req, res) => {
  try {
    const a = normalizeAppPayload(req.body || {});
    const result = await pool.query(
      `UPDATE customer_apps SET app_name=$2, app_model=$3, access_type=$4, mac_address=$5, device_key=$6, username=$7, password=$8, provider_url=$9, host=$10, android_link=$11, ios_link=$12, icon_url=$13, app_site_url=$14, is_tv=$15
       WHERE id=$1 RETURNING *`,
      [req.params.id, a.app_name, a.app_model, a.access_type, a.mac_address, a.device_key, a.username, a.password, a.provider_url, a.host, a.android_link, a.ios_link, a.icon_url, a.app_site_url, a.is_tv]
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

// === STARTFLIX SUPABASE INTEGRATION ===
app.use('/api/startflix', (req, res, next) => {
  if (!supabaseStartflix) return res.status(503).json({ error: 'Integração Startflix não configurada.' });
  next();
});
app.get('/api/startflix/users', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseStartflix
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/startflix/payments', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseStartflix
      .from('payments')
      .select('*, profiles!user_id(username, full_name, email)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/startflix/sync', requireAdmin, async (req, res) => {
  const { username, expirationDate } = req.body;
  if (!username) return res.status(400).json({ error: 'username é obrigatório' });

  try {
    // 1. Buscar por username (nao case sensitive se possível, mas vamos seguir o exato)
    let { data: profile, error: searchError } = await supabaseStartflix
      .from('profiles')
      .select('id, username')
      .eq('username', username)
      .maybeSingle();

    let userId = profile?.id;

    if (!userId) {
      // 2. Criar no Auth
      const email = `${username.toLowerCase()}@startflix.app`;
      const password = Math.random().toString(36).slice(-8);

      const { data: newUser, error: authError } = await supabaseAuthAdmin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username }
      });

      if (authError) throw authError;
      userId = newUser.user.id;
      
      // 3. Criar profile
      const { error: profileError } = await supabaseStartflix
        .from('profiles')
        .insert({
          id: userId,
          email,
          username,
          app_username: username,
          app_password_app: password,
          is_active: true,
          has_signal: true,
          expiration_date: expirationDate || null
        });
      
      if (profileError) throw profileError;
    } else {
      // 4. Atualizar
      const { error: updateError } = await supabaseStartflix
        .from('profiles')
        .update({
          is_active: true,
          has_signal: true,
          expiration_date: expirationDate || null
        })
        .eq('id', userId);
      
      if (updateError) throw updateError;
    }

    res.json({ success: true, userId });
  } catch (e: any) {
    console.error('[Startflix Sync Error]', e);
    res.status(500).json({ error: e.message });
  }
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
  // Invalida caches que dependem de settings para que o novo valor seja lido imediatamente.
  if (key === 'gemini_api_key') _geminiKeyCache = { value: null, ts: 0 };
  if (['plan_price_1','plan_price_2','plan_price_3','app_fee_ibo','app_fee_ibo_pro','app_fee_vu_player','app_fee_bob_player'].includes(key)) _salePricesCache = { ..._salePricesCache, ts: 0 };
  if (key === 'xciptv_server_url') _xciptvUrlCache = { ..._xciptvUrlCache, ts: 0 };
  if (key === 'greeting_reset_seconds') _greetingResetCache = { ..._greetingResetCache, ts: 0 };
  if (key === 'admin_whatsapp_numbers') _adminNumbersCache = { ..._adminNumbersCache, ts: 0 };
  res.json({ success: true });
});

// ============================================================
// POOL M3U — Sistema de compartilhamento de listas
// ============================================================

// --- Helpers internos ---

/** Gera código alfanumérico único de 8 caracteres */
function generateM3uCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase(); // ex: A3F92B1C
}

/**
 * Tenta extrair credenciais Xtream de uma URL M3U no formato:
 * http://server:port/get.php?username=xxx&password=yyy&type=m3u_plus
 */
function parseXtreamFromM3u(m3uUrl: string): { dns: string; username: string; password: string } | null {
  try {
    const u = new URL(m3uUrl);
    const username = u.searchParams.get('username');
    const password = u.searchParams.get('password');
    if (username && password) {
      return { dns: `${u.protocol}//${u.host}`, username, password };
    }
  } catch { /* URL inválida */ }
  return null;
}

/** Retorna a lease ativa de um código (se existir) */
async function getActiveLease(code: string) {
  const r = await pool.query(
    `SELECT l.*, p.m3u_url, p.name AS list_name
     FROM m3u_leases l
     JOIN m3u_pool_lists p ON p.id = l.list_id
     WHERE l.code = $1 AND l.is_active = true
     LIMIT 1`,
    [code]
  );
  return r.rows[0] || null;
}

/** Atribui uma lista livre ao código e devolve a lease criada */
async function acquireLease(code: string, deviceId?: string) {
  // Escolhe uma lista ativa que NÃO está em uso por nenhuma lease ativa
  const listRes = await pool.query(
    `SELECT id, name, m3u_url FROM m3u_pool_lists
     WHERE is_active = true
       AND id NOT IN (
         SELECT list_id FROM m3u_leases WHERE is_active = true
       )
     ORDER BY id
     LIMIT 1`
  );
  if (!listRes.rows[0]) return null; // pool esgotado

  const list = listRes.rows[0];
  const ins = await pool.query(
    `INSERT INTO m3u_leases (code, list_id, device_id)
     VALUES ($1, $2, $3)
     RETURNING id, leased_at`,
    [code, list.id, deviceId || null]
  );
  return { ...ins.rows[0], m3u_url: list.m3u_url, list_name: list.name };
}

// --- Admin: Pool de listas ---

app.get('/api/m3u/lists', requireAdmin, async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT l.*,
         (SELECT COUNT(*) FROM m3u_leases ls
          WHERE ls.list_id = l.id AND ls.is_active = true) AS active_leases
       FROM m3u_pool_lists l
       ORDER BY l.created_at DESC`
    );
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/m3u/lists', requireAdmin, async (req, res) => {
  try {
    const { name, m3u_url, notes } = req.body;
    if (!name || !m3u_url) return res.status(400).json({ error: 'name e m3u_url são obrigatórios' });
    const r = await pool.query(
      `INSERT INTO m3u_pool_lists (name, m3u_url, notes) VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), m3u_url.trim(), notes?.trim() || null]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/m3u/lists/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    // Libera leases ativas antes de remover
    await pool.query(
      `UPDATE m3u_leases SET is_active = false, released_at = NOW()
       WHERE list_id = $1 AND is_active = true`, [id]
    );
    await pool.query('DELETE FROM m3u_pool_lists WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/m3u/lists/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, m3u_url, notes, is_active } = req.body;
    await pool.query(
      `UPDATE m3u_pool_lists SET
        name = COALESCE($1, name),
        m3u_url = COALESCE($2, m3u_url),
        notes = COALESCE($3, notes),
        is_active = COALESCE($4, is_active)
       WHERE id = $5`,
      [name, m3u_url, notes, is_active, id]
    );
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- Admin: Códigos de acesso ---

app.get('/api/m3u/codes', requireAdmin, async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT c.*,
         (SELECT COUNT(*) FROM m3u_leases l
          WHERE l.code = c.code AND l.is_active = true) AS active_leases
       FROM m3u_access_codes c
       ORDER BY c.created_at DESC`
    );
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/m3u/codes', requireAdmin, async (req, res) => {
  try {
    const { label, code: customCode } = req.body;
    const code = (customCode?.trim().toUpperCase()) || generateM3uCode();
    const r = await pool.query(
      `INSERT INTO m3u_access_codes (code, label) VALUES ($1, $2)
       ON CONFLICT (code) DO NOTHING RETURNING *`,
      [code, label?.trim() || null]
    );
    if (!r.rows[0]) return res.status(409).json({ error: 'Código já existe' });
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/m3u/codes/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    // Pega o code antes de deletar para revogar leases
    const codeRes = await pool.query('SELECT code FROM m3u_access_codes WHERE id = $1', [id]);
    if (codeRes.rows[0]) {
      await pool.query(
        `UPDATE m3u_leases SET is_active = false, released_at = NOW()
         WHERE code = $1 AND is_active = true`, [codeRes.rows[0].code]
      );
    }
    await pool.query('DELETE FROM m3u_access_codes WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- Admin: Leases ativas ---

app.get('/api/m3u/leases', requireAdmin, async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT l.*, p.name AS list_name, p.m3u_url,
         ROUND(EXTRACT(EPOCH FROM (NOW() - l.leased_at)) / 60) AS minutes_connected,
         ROUND(EXTRACT(EPOCH FROM (NOW() - l.last_heartbeat)) / 60) AS minutes_since_heartbeat
       FROM m3u_leases l
       JOIN m3u_pool_lists p ON p.id = l.list_id
       WHERE l.is_active = true
       ORDER BY l.leased_at DESC`
    );
    res.json(r.rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/m3u/leases/:id/revoke', requireAdmin, async (req, res) => {
  try {
    await pool.query(
      `UPDATE m3u_leases SET is_active = false, released_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Admin: estatísticas rápidas
app.get('/api/m3u/stats', requireAdmin, async (_req, res) => {
  try {
    const [lists, codes, leases] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active) AS active FROM m3u_pool_lists`),
      pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active) AS active FROM m3u_access_codes`),
      pool.query(`SELECT COUNT(*) AS active FROM m3u_leases WHERE is_active = true`),
    ]);
    const totalActive = parseInt(lists.rows[0].active);
    const inUse = parseInt(leases.rows[0].active);
    res.json({
      lists_total: parseInt(lists.rows[0].total),
      lists_active: totalActive,
      lists_in_use: inUse,
      lists_available: totalActive - inUse,
      codes_total: parseInt(codes.rows[0].total),
      codes_active: parseInt(codes.rows[0].active),
      leases_active: inUse,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// --- Endpoints públicos (chamados pelo app) ---

/**
 * POST /api/m3u/access
 * Body: { code: string, device_id?: string }
 * Retorna a URL M3U atribuída ao código (ou reutiliza lease ativa).
 */
app.post('/api/m3u/access', async (req, res) => {
  try {
    const { code, device_id } = req.body;
    if (!code) return res.status(400).json({ error: 'code obrigatório' });

    const codeUpper = String(code).trim().toUpperCase();

    // Valida código
    const codeRes = await pool.query(
      `SELECT * FROM m3u_access_codes WHERE code = $1 AND is_active = true`, [codeUpper]
    );
    if (!codeRes.rows[0]) return res.status(403).json({ error: 'Código inválido ou desativado' });

    // Se já tem lease ativa, renova heartbeat e devolve
    const existing = await getActiveLease(codeUpper);
    if (existing) {
      await pool.query(
        `UPDATE m3u_leases SET last_heartbeat = NOW() WHERE id = $1`, [existing.id]
      );
      const xtream = parseXtreamFromM3u(existing.m3u_url);
      return res.json({
        success: true,
        lease_id: existing.id,
        m3u_url: existing.m3u_url,
        list_name: existing.list_name,
        reused: true,
        ...(xtream ?? {}),
      });
    }

    // Adquire nova lease
    const lease = await acquireLease(codeUpper, device_id);
    if (!lease) {
      return res.status(503).json({
        error: 'Todas as listas estão em uso no momento. Tente novamente em alguns minutos.',
        pool_exhausted: true,
      });
    }

    const xtream = parseXtreamFromM3u(lease.m3u_url);
    console.log(`[M3U] Lease criada: code=${codeUpper} → lista="${lease.list_name}" (id=${lease.id})${xtream ? ' [xtream]' : ''}`);
    res.json({
      success: true,
      lease_id: lease.id,
      m3u_url: lease.m3u_url,
      list_name: lease.list_name,
      reused: false,
      ...(xtream ?? {}),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/**
 * POST /api/m3u/heartbeat
 * Body: { code: string, lease_id: number }
 * Mantém a lease viva. O app deve chamar a cada 2-3 minutos.
 */
app.post('/api/m3u/heartbeat', async (req, res) => {
  try {
    const { code, lease_id } = req.body;
    const r = await pool.query(
      `UPDATE m3u_leases SET last_heartbeat = NOW()
       WHERE id = $1 AND code = $2 AND is_active = true
       RETURNING id`,
      [lease_id, String(code).trim().toUpperCase()]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Lease não encontrada ou expirada' });
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/**
 * POST /api/m3u/release
 * Body: { code: string, lease_id: number }
 * Libera a lista de volta ao pool quando o usuário sai do app.
 */
app.post('/api/m3u/release', async (req, res) => {
  try {
    const { code, lease_id } = req.body;
    await pool.query(
      `UPDATE m3u_leases SET is_active = false, released_at = NOW()
       WHERE id = $1 AND code = $2 AND is_active = true`,
      [lease_id, String(code).trim().toUpperCase()]
    );
    console.log(`[M3U] Lease liberada: code=${code} lease_id=${lease_id}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Messages & Contacts
app.get('/api/contacts', async (req, res) => {
  const result = await pool.query('SELECT * FROM contacts ORDER BY last_message_time DESC');
  res.json(result.rows);
});

// Agenda — todos os contatos com flag de cliente cadastrado
app.get('/api/contacts/all', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*,
        CASE WHEN cu.id IS NOT NULL THEN true ELSE false END AS is_customer
      FROM contacts c
      LEFT JOIN customers cu ON cu.whatsapp = SPLIT_PART(c.remote_jid, '@', 1)
      ORDER BY c.last_message_time DESC NULLS LAST
    `);
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Broadcast — dispara uma mensagem para todos os contatos WhatsApp
app.post('/api/contacts/broadcast', requireAdmin, async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Mensagem obrigatória' });
    }

    const settings = await pool.query("SELECT key, value FROM settings WHERE key LIKE 'evolution_%'");
    const config: any = {};
    settings.rows.forEach((r: any) => config[r.key] = r.value);

    if (!config.evolution_api_url || !config.evolution_token || !config.evolution_instance) {
      return res.status(400).json({ error: 'Evolution API não configurada. Configure em Admin → Automações.' });
    }

    const evo = new EvolutionService({
      apiUrl: config.evolution_api_url,
      token: config.evolution_token,
      instance: config.evolution_instance,
    });

    // Busca apenas contatos WhatsApp reais (sem web: e sem grupos)
    const contactsRes = await pool.query(
      `SELECT remote_jid, name FROM contacts
       WHERE remote_jid NOT LIKE 'web:%'
         AND remote_jid NOT LIKE '%@g.us'
         AND remote_jid NOT LIKE '%@broadcast'
       ORDER BY last_message_time DESC NULLS LAST`
    );

    const contacts = contactsRes.rows;
    let sent = 0;
    let failed = 0;

    for (const contact of contacts) {
      try {
        await evo.sendMessage(contact.remote_jid, message.trim());
        sent++;
        // Pequena pausa para não derrubar o WhatsApp com flood
        await new Promise(r => setTimeout(r, 800));
      } catch {
        failed++;
      }
    }

    res.json({ sent, failed, total: contacts.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/messages', requireAdmin, async (req, res) => {
  const { remoteJid } = req.query;
  if (!remoteJid) return res.status(400).json({ error: 'remoteJid obrigatório' });
  const result = await pool.query(
    'SELECT * FROM messages WHERE remote_jid = $1 ORDER BY created_at ASC LIMIT 200',
    [remoteJid]
  );
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

// Alias com username na URL — usado pelo AdminPanel.tsx no botao de renovacao.
// Quando o job termina com sucesso, atualiza a data de vencimento e last_renewal
// no nosso DB (StartPainel adiciona 1 mes — espelha a mesma logica).
app.post('/api/panel/renew/:username', requireAdmin, async (req, res) => {
  try {
    const { username } = req.params;
    if (!username) return res.status(400).json({ error: 'username obrigatorio' });
    const jobId = await enqueueJob('renew_client', { username });
    const result: any = await waitForJob(jobId);

    if (result?.success) {
      try {
        const cur = await pool.query('SELECT expiration_date FROM customers WHERE username = $1', [username]);
        if (cur.rows.length > 0) {
          const currentExp = cur.rows[0].expiration_date ? new Date(cur.rows[0].expiration_date) : new Date();
          const base = currentExp > new Date() ? currentExp : new Date();
          const newExp = new Date(base);
          newExp.setMonth(newExp.getMonth() + 1);
          const newExpStr = newExp.toISOString().split('T')[0];
          await pool.query(
            'UPDATE customers SET expiration_date = $1, last_renewal = NOW(), status = $2, updated_at = NOW() WHERE username = $3',
            [newExpStr, 'active', username]
          );
          result.newExpirationDate = newExpStr;
        }
      } catch (dbErr: any) {
        console.error('[renew] DB update falhou apos renew OK:', dbErr?.message);
        result.warning = 'Renovado no painel, mas falhou ao atualizar data no DB local';
      }
    }

    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/automations/ibo/run', async (req, res) => {
  try {
    const { mac, key, playlistUrl, targetUrl } = req.body;
    if (!mac || !key || !playlistUrl) return res.status(400).json({ error: 'mac, key e playlistUrl obrigatorios' });
    const jobId = await enqueueJob('ibo_setup', { mac, key, playlistUrl, targetUrl });
    const result = await waitForJob(jobId);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/automations/ibo/repair', async (req, res) => {
  try {
    const { mac, key, playlistUrl } = req.body;
    if (!mac || !key || !playlistUrl) return res.status(400).json({ error: 'mac, key e playlistUrl obrigatorios' });
    const jobId = await enqueueJob('ibo_repair', { mac, key, playlistUrl });
    const result = await waitForJob(jobId);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/automations/ibopro/run', async (req, res) => {
  try {
    const { mac, key, playlistUrl } = req.body;
    if (!mac || !key || !playlistUrl) return res.status(400).json({ error: 'mac, key e playlistUrl obrigatorios' });
    const jobId = await enqueueJob('ibo_pro_setup', { mac, key, playlistUrl });
    const result = await waitForJob(jobId);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/automations/smartone/setup', async (req, res) => {
  try {
    const { mac, listName, playlistUrl } = req.body;
    if (!mac || !playlistUrl) return res.status(400).json({ error: 'mac e playlistUrl obrigatorios' });
    const name = listName || 'Lista Cliente';
    const jobId = await enqueueJob('smartone_setup', { mac, listName: name, playlistUrl });
    const result = await waitForJob(jobId);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Abre browser visível no worker para login manual do SmartOne (resolve Cloudflare Turnstile)
app.post('/api/automations/smartone/init', async (req, res) => {
  try {
    const jobId = await enqueueJob('smartone_init', {});
    // Aguarda até 4 minutos (o usuário precisa logar manualmente no browser)
    const result = await waitForJob(jobId, 240_000);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/automations/vupro/setup', async (req, res) => {
  try {
    const { mac, deviceKey, playlistUrl, listName } = req.body;
    if (!mac || !playlistUrl) return res.status(400).json({ error: 'mac e playlistUrl obrigatorios' });
    const key = deviceKey || '687840';
    const name = listName || 'Lista Cliente';
    const jobId = await enqueueJob('vupro_setup', { mac, deviceKey: key, playlistUrl, listName: name });
    const result = await waitForJob(jobId);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/automations/startpainel/create-client', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username obrigatorio' });
    const result: any = await waitForJob(await enqueueJob('create_client', { username }));
    
    // Se sucesso, atualiza a M3U e possivelmente a senha no DB local
    if (result.success && (result.username || username)) {
      const targetUser = result.username || username;
      try {
         await pool.query(
           `UPDATE customers SET 
              playlist_url = COALESCE($2, playlist_url), 
              password = COALESCE($3, password),
              dns = COALESCE($4, dns),
              updated_at = NOW() 
            WHERE username = $1`,
           [targetUser, result.playlistUrl || null, result.password || null, (result.dns || result.playlistUrl) || null]
         );
         if (result.password) {
            await pool.query(
              `UPDATE customer_apps SET password = $2 WHERE username = $1`,
              [targetUser, result.password]
            );
         }
         console.log(`[Automation] Cliente ${targetUser} atualizado com sucesso no DB local.`);
      } catch (dbErr: any) {
        console.error('[Automation] Erro ao atualizar cliente oficial no DB:', dbErr.message);
      }
    }
    
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

app.post('/api/automations/startpainel/activate-funplay', async (req, res) => {
  try {
    const { username, mac } = req.body;
    if (!username || !mac) return res.status(400).json({ error: 'username e mac obrigatorios' });
    const jobId = await enqueueJob('activate_funplay', { username, mac });
    const result = await waitForJob(jobId);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Endpoints para os outros players (mesma mecanica). Mantemos cada um separado pra
// o painel admin chamar facilmente, e mapeia 1:1 no worker (activate_xxx).
app.post('/api/automations/startpainel/activate-lazerplay', async (req, res) => {
  try {
    const { username, mac } = req.body;
    if (!username || !mac) return res.status(400).json({ error: 'username e mac obrigatorios' });
    const result = await waitForJob(await enqueueJob('activate_lazerplay', { username, mac }));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/automations/startpainel/activate-xcloud', async (req, res) => {
  try {
    const { username, mac } = req.body;
    if (!username || !mac) return res.status(400).json({ error: 'username e mac obrigatorios' });
    const result = await waitForJob(await enqueueJob('activate_xcloud', { username, mac }));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/automations/startpainel/activate-seeplay', async (req, res) => {
  try {
    const { username, mac } = req.body;
    if (!username || !mac) return res.status(400).json({ error: 'username e mac obrigatorios' });
    const result = await waitForJob(await enqueueJob('activate_seeplay', { username, mac }));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Cria cliente TESTE (6h) no CMS ja com o MAC ativado no player escolhido.
// Util pra novo lead: 1 acao -> cliente cadastrado + player funcionando.
app.post('/api/automations/startpainel/create-test', async (req, res) => {
  try {
    const { username, mac, playerName } = req.body;
    if (!mac || !playerName) {
      return res.status(400).json({ error: 'mac e playerName obrigatorios (username opcional — gera automatico se vazio)' });
    }
    const finalUsername = sanitizeTestUsername(username || '');
    const result: any = await waitForJob(await enqueueJob('create_test', { username: finalUsername, mac, playerName }));
    
    // Se sucesso, salva/atualiza o cliente localmente como 'teste'
    if (result.success && (result.username || finalUsername)) {
      const targetUser = result.username || finalUsername;
      try {
        const expirationDate = new Date();
        expirationDate.setHours(expirationDate.getHours() + 6); // Teste padrão de 6h
        const expStr = expirationDate.toISOString().split('T')[0];

        // Upsert no customer
        const custRes = await pool.query(
          `INSERT INTO customers (username, status, expiration_date, name, password, dns)
           VALUES ($1, 'teste', $2, $3, $4, $5)
           ON CONFLICT (username) DO UPDATE SET
             status = 'teste',
             expiration_date = $2,
             password = EXCLUDED.password,
             dns = EXCLUDED.dns,
             updated_at = NOW()
           RETURNING id`,
          [targetUser, expStr, `Teste: ${targetUser}`, result.password || null, (result.dns || result.playlistUrl) || null]
        );
        const customerId = custRes.rows[0].id;

        // Cria o app associado se nao existir um com mesmo MAC
        await pool.query(
          `INSERT INTO customer_apps (customer_id, app_name, app_model, access_type, mac_address, username, password)
           VALUES ($1, $2, $3, 'mac_key', $4, $5, $6)
           ON CONFLICT DO NOTHING`, 
          [customerId, playerName, playerName, mac, targetUser, result.password || '']
        );
        console.log(`[Automation] Teste ${targetUser} registrado com sucesso no DB local.`);
      } catch (dbErr: any) {
        console.error('[Automation] Erro ao salvar cliente teste no DB:', dbErr.message, { targetUser, mac });
      }
    }
    
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/**
 * Atualiza/repara a lista do cliente no iboproapp.com automaticamente.
 *
 * O caller passa SO O USERNAME do cliente — o endpoint busca tudo no DB:
 *   1. customers.playlist_url do cliente
 *   2. customer_apps com app_model = 'IBO PRO' (ou parecido) — pega MAC + Device Key
 *
 * Depois enfileira o job ibo_pro_setup com (mac, key, playlistUrl).
 * Util pra IA chamar quando cliente reporta "lista nao funciona" no IBO Pro,
 * e pro botao do AdminPanel "Atualizar IBO Pro (Robô)".
 */
app.post('/api/automations/iboproapp/setup', async (req, res) => {
  try {
    const { username, customerId, mac: macOverride, key: keyOverride, playlistUrl: urlOverride } = req.body;

    // Caminho 1: caller passou tudo direto (sem precisar de lookup no DB)
    if (macOverride && keyOverride && urlOverride) {
      const result = await waitForJob(await enqueueJob('ibo_pro_setup', {
        mac: macOverride, key: keyOverride, playlistUrl: urlOverride,
      }));
      return res.json(result);
    }

    // Caminho 2: lookup pelo cliente
    if (!username && !customerId) {
      return res.status(400).json({ error: 'Passa username (ou customerId), OU mac+key+playlistUrl direto.' });
    }

    const custRes = await pool.query(
      customerId
        ? 'SELECT id, username, playlist_url FROM customers WHERE id = $1'
        : 'SELECT id, username, playlist_url FROM customers WHERE username = $1',
      [customerId || username]
    );
    const customer = custRes.rows[0];
    if (!customer) return res.status(404).json({ error: `Cliente "${username || customerId}" nao encontrado.` });
    if (!customer.playlist_url) {
      return res.status(400).json({ error: `Cliente "${customer.username}" nao tem playlist_url cadastrada. Cadastre primeiro.` });
    }

    // Procura o app IBO PRO desse cliente — match flexivel no app_model/app_name
    const appsRes = await pool.query(
      `SELECT app_name, app_model, mac_address, device_key FROM customer_apps WHERE customer_id = $1`,
      [customer.id]
    );
    const iboApp = appsRes.rows.find((a: any) => {
      const m = (a.app_model || '').toUpperCase();
      const n = (a.app_name || '').toUpperCase();
      return m.includes('IBO PRO') || n.includes('IBO PRO');
    });
    if (!iboApp) {
      return res.status(400).json({ error: `Cliente "${customer.username}" nao tem app cadastrado como "IBO PRO".` });
    }
    if (!iboApp.mac_address || !iboApp.device_key) {
      return res.status(400).json({ error: `App IBO PRO do cliente "${customer.username}" precisa ter MAC e Device Key cadastrados.` });
    }

    const result = await waitForJob(await enqueueJob('ibo_pro_setup', {
      mac: iboApp.mac_address,
      key: iboApp.device_key,
      playlistUrl: customer.playlist_url,
    }));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/**
 * Atualiza/repara a lista do cliente no iboplayer.com (IBO PLAYER classico — NAO o PRO).
 * Mesma logica do /iboproapp/setup mas:
 *   - Procura customer_apps com modelo contendo 'IBO' mas SEM 'PRO'
 *   - Enfileira job 'ibo_setup' (mapeia pra runIBOSupportAutomation no worker,
 *     que opera em iboplayer.com / iboiptv.com)
 */
app.post('/api/automations/iboplayer/setup', async (req, res) => {
  try {
    const { username, customerId, mac: macOverride, key: keyOverride, playlistUrl: urlOverride } = req.body;

    // Caminho 1: caller passou tudo direto
    if (macOverride && keyOverride && urlOverride) {
      const result = await waitForJob(await enqueueJob('ibo_setup', {
        mac: macOverride, key: keyOverride, playlistUrl: urlOverride,
      }));
      return res.json(result);
    }

    if (!username && !customerId) {
      return res.status(400).json({ error: 'Passa username (ou customerId), OU mac+key+playlistUrl direto.' });
    }

    const custRes = await pool.query(
      customerId
        ? 'SELECT id, username, playlist_url FROM customers WHERE id = $1'
        : 'SELECT id, username, playlist_url FROM customers WHERE username = $1',
      [customerId || username]
    );
    const customer = custRes.rows[0];
    if (!customer) return res.status(404).json({ error: `Cliente "${username || customerId}" nao encontrado.` });
    if (!customer.playlist_url) {
      return res.status(400).json({ error: `Cliente "${customer.username}" nao tem playlist_url cadastrada. Cadastre primeiro.` });
    }

    // Match: contem "IBO" mas NAO contem "PRO" (pra distinguir do IBO PRO).
    const appsRes = await pool.query(
      `SELECT app_name, app_model, mac_address, device_key FROM customer_apps WHERE customer_id = $1`,
      [customer.id]
    );
    const iboApp = appsRes.rows.find((a: any) => {
      const m = (a.app_model || '').toUpperCase();
      const n = (a.app_name || '').toUpperCase();
      const matchesIbo = m.includes('IBO') || n.includes('IBO');
      const isPro = m.includes('PRO') || n.includes('PRO');
      return matchesIbo && !isPro;
    });
    if (!iboApp) {
      return res.status(400).json({ error: `Cliente "${customer.username}" nao tem app cadastrado como "IBO PLAYER" (so PRO ou nenhum).` });
    }
    if (!iboApp.mac_address || !iboApp.device_key) {
      return res.status(400).json({ error: `App IBO PLAYER do cliente "${customer.username}" precisa ter MAC e Device Key cadastrados.` });
    }

    const result = await waitForJob(await enqueueJob('ibo_setup', {
      mac: iboApp.mac_address,
      key: iboApp.device_key,
      playlistUrl: customer.playlist_url,
    }));
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
    const { sessionId, name, phone, message, image } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId obrigatório' });
    }
    // Mensagem OU imagem (cliente pode mandar só uma foto)
    const hasText = typeof message === 'string' && message.trim().length > 0;
    const hasImage = image && typeof image.data === 'string' && typeof image.mimeType === 'string';
    if (!hasText && !hasImage) {
      return res.status(400).json({ error: 'message ou image obrigatório' });
    }

    const remoteJid = `web:${sessionId}@public`;
    const visitorName = (typeof name === 'string' && name.trim()) ? name.trim() : 'Visitante';
    const visitorPhone = (typeof phone === 'string') ? phone.replace(/\D/g, '') : '';
    const storedText = hasText ? message.trim() : '[Imagem enviada]';

    await pool.query(
      'INSERT INTO contacts (remote_jid, name, last_message, last_message_time, updated_at) VALUES ($1, $2, $3, NOW(), NOW()) ON CONFLICT (remote_jid) DO UPDATE SET name=EXCLUDED.name, last_message=EXCLUDED.last_message, last_message_time=NOW(), updated_at=NOW()',
      [remoteJid, visitorName, storedText]
    );
    await pool.query(
      'INSERT INTO messages (text, sender, type, remote_jid, contact_name) VALUES ($1, $2, $3, $4, $5)',
      [storedText, 'customer', hasImage ? 'image' : 'text', remoteJid, visitorName]
    );

    // Grava lead com o telefone (se informado) — facilita o follow-up no WhatsApp depois
    if (visitorPhone) {
      void (async () => {
        try { await upsertLead(remoteJid, visitorName, storedText, null, visitorPhone); } catch {}
      })();
    }

    const historyRes = await pool.query(
      'SELECT text, sender FROM messages WHERE remote_jid = $1 ORDER BY created_at DESC LIMIT 10',
      [remoteJid]
    );
    const chatHistory = historyRes.rows.reverse().map((m: any) => ({
      role: (m.sender === 'ai' || m.sender === 'attendant') ? 'model' : 'user',
      parts: [{ text: m.text || '[Mídia]' }]
    }));

    const mediaData = hasImage ? { data: image.data.replace(/^data:.*?;base64,/, ''), mimeType: image.mimeType } : undefined;

    const aiResult = await handleAIChat(
      remoteJid,
      chatHistory,
      { name: visitorName, phone: visitorPhone, isWebChat: true },
      mediaData
    );
    let replyText = aiResult.text || '😕 Me perdi aqui um instante. Pode repetir, por favor?';

    // Detecta o marcador de handoff que o Lucas pode adicionar quando o cliente quer
    // assinar/pagar. Limpa o texto e retorna a info pro frontend mostrar o botão.
    let handoff: { url: string; label: string } | null = null;
    if (/\[CONTINUAR_NO_WHATSAPP\]/i.test(replyText)) {
      replyText = replyText.replace(/\[CONTINUAR_NO_WHATSAPP\]/gi, '').trim();
      try {
        const r = await pool.query("SELECT value FROM settings WHERE key = 'whatsapp_support'");
        const num = String(r.rows[0]?.value || '').replace(/\D/g, '');
        if (num) {
          const greet = encodeURIComponent(`Olá! Sou ${visitorName}, vim do atendimento web e quero seguir aqui.`);
          handoff = { url: `https://wa.me/${num}?text=${greet}`, label: 'Continuar no WhatsApp' };
        }
      } catch {}
    }

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

    res.json({ text: replyText, audio, handoff });
  } catch (e: any) {
    console.error('[PublicChat Error]', e?.message || e);
    res.status(500).json({ error: e?.message || 'Erro interno' });
  }
});

// Detecta se a mensagem é essencialmente uma saudação (oi, bom dia, etc.).
// Usado para reiniciar o atendimento quando o cliente volta após um tempo.
function isGreetingMessage(raw: string): boolean {
  if (!raw) return false;
  const s = raw
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-z\s]/g, ' ')                        // tira pontuação/emojis/números
    .replace(/\s+/g, ' ')
    .trim();
  if (!s || s.length > 28) return false; // saudações são curtas
  // String inteira composta só de saudações (uma ou duas partes)
  const greet = '(oi+|ola|oie|opa+|eai|eae|e ai|salve|fala|fala ai|alo|hello|hi|hey|boa|bom dia|boa tarde|boa noite|boa madrugada|tudo bem|tudo bom|td bem|blz|beleza|como vai|vc ai|ta ai|esta ai)';
  const re = new RegExp(`^${greet}( ${greet})?$`);
  return re.test(s);
}

// Menu de atalhos exibido no início de cada novo atendimento (WhatsApp List Message).
// rowId vai pro backend ao clicar; title é o que o cliente vê.
const ATTENDANCE_MENU_ROWS = [
  { rowId: 'opt_startflix_celular', title: 'Código Startflix Grátis (Celular)' },
  { rowId: 'opt_testar_app_tv',     title: 'Testar App na TV' },
  { rowId: 'opt_testar_firestick',  title: 'Testar no Firestick' },
  { rowId: 'opt_testar_roku',       title: 'Testar TV Roku' },
  { rowId: 'opt_testar_tvbox',      title: 'Testar TV Box' },
  { rowId: 'opt_app_iphone',        title: 'App para iPhone' },
  { rowId: 'opt_atualizar_sinal',   title: 'Atualizar meu sinal' },
  { rowId: 'opt_pagamento',         title: 'Fazer pagamento' },
  { rowId: 'opt_outros',            title: 'Outros' },
];

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
    // WhatsApp moderno: quando JID e @lid (identidade mascarada), o numero real vai em
    // key.remoteJidAlt (@s.whatsapp.net). Capturamos pra fazer lookup do cliente certo.
    const altJid: string | null = data.data.key.remoteJidAlt || null;
    if (data.data.key.fromMe) return;
    pushName = data.data.pushName || (remoteJid ? remoteJid.split('@')[0] : 'Cliente');
    console.log(`[Webhook] Mensagem recebida de ${pushName} (${remoteJid}${altJid ? ' alt=' + altJid : ''})`);

    let text = msg?.conversation
      || msg?.extendedTextMessage?.text
      || msg?.imageMessage?.caption
      || msg?.videoMessage?.caption
      || msg?.message?.conversation
      // Resposta de WhatsApp List Message: o usuário clicou numa opção do menu
      || msg?.listResponseMessage?.title
      || msg?.listResponseMessage?.singleSelectReply?.selectedRowId
      || msg?.message?.listResponseMessage?.title
      || '';
    const isImage = !!msg?.imageMessage;
    const isAudio = !!msg?.audioMessage;
    if (!text && !isImage && !isAudio) return;

    // Visible placeholder for media-only messages so the AI knows what to expect.
    const storedText = text || (isImage ? '[Imagem enviada]' : isAudio ? '[Áudio enviado]' : '[Mídia]');

    // Tempo desde a última mensagem (ANTES de inserir a atual) — usado para reiniciar
    // o atendimento quando o cliente volta com uma saudação após inatividade.
    let gapSinceLastMs = Infinity;
    try {
      const lastMsg = await pool.query('SELECT created_at FROM messages WHERE remote_jid = $1 ORDER BY created_at DESC LIMIT 1', [remoteJid]);
      if (lastMsg.rows[0]?.created_at) gapSinceLastMs = Date.now() - new Date(lastMsg.rows[0].created_at).getTime();
    } catch { /* primeira mensagem ou erro — trata como sem histórico */ }

    await pool.query('INSERT INTO contacts (remote_jid, name, last_message, last_message_time, updated_at) VALUES ($1, $2, $3, NOW(), NOW()) ON CONFLICT (remote_jid) DO UPDATE SET name=EXCLUDED.name, last_message=EXCLUDED.last_message, last_message_time=NOW(), updated_at=NOW()', [remoteJid, pushName, storedText]);
    await pool.query('INSERT INTO messages (text, sender, type, remote_jid, contact_name) VALUES ($1, $2, $3, $4, $5)', [storedText, 'customer', isImage ? 'image' : isAudio ? 'audio' : 'text', remoteJid, pushName]);

    const historyRes = await pool.query('SELECT text, sender FROM messages WHERE remote_jid = $1 ORDER BY created_at DESC LIMIT 10', [remoteJid]);
    let chatHistory = historyRes.rows.reverse().map(m => ({ role: (m.sender === 'ai' || m.sender === 'attendant') ? 'model' : 'user', parts: [{ text: m.text || '[Mídia]' }] }));

    // Novo atendimento: se o cliente mandou uma saudação após X seg parado, ignora o
    // contexto anterior e começa do zero. Ao invés do Lucas responder com texto, enviamos
    // uma LISTA CLICÁVEL de atalhos (Código Startflix, Testar TV, Pagamento, etc.) para
    // agilizar o atendimento. O tempo é configurável (greeting_reset_seconds); 0 desativa.
    const resetSeconds = await getGreetingResetSeconds();
    const isNewAttendance = resetSeconds > 0
      && isGreetingMessage(text)
      && gapSinceLastMs > resetSeconds * 1000;

    if (isNewAttendance) {
      console.log(`[Webhook] Saudação após ${Math.round(gapSinceLastMs / 1000)}s parado → novo atendimento: enviando menu.`);
      const firstName = (pushName || 'Cliente').split(' ')[0];
      const cfg = await pool.query('SELECT key, value FROM settings WHERE key LIKE $1', ['evolution_%']);
      const config: any = {}; cfg.rows.forEach(r => config[r.key] = r.value);
      const evo = new EvolutionService({ apiUrl: config.evolution_api_url, token: config.evolution_token, instance: config.evolution_instance });

      // 1) Tenta WhatsApp List Message (interativa). Algumas versões do Evolution/Baileys não
      //    suportam — capturamos o erro e seguimos pro plano B.
      let listOk = false;
      try {
        await evo.sendList(remoteJid, {
          title:       `Olá, ${firstName}! 👋`,
          description: 'Pra agilizar seu atendimento, escolha uma opção abaixo. Se preferir, é só digitar sua dúvida normalmente.',
          buttonText:  'Ver opções',
          footerText:  'StartPainel — atendimento',
          sections: [{ title: 'Atalhos', rows: ATTENDANCE_MENU_ROWS }],
        });
        listOk = true;
      } catch (e: any) {
        console.warn('[Webhook] sendList falhou — usando menu em texto numerado:', e?.message);
      }

      // 2) Plano B: menu em texto numerado (funciona em qualquer WhatsApp/versão).
      //    Sempre enviamos um texto também — se a lista nativa renderizar, o cliente vê
      //    as duas coisas (lista clicável + texto); se não, ao menos o texto chega.
      const textMenu =
        `👋 Olá, ${firstName}! Pra agilizar, é só responder com o *número* da opção:\n\n` +
        ATTENDANCE_MENU_ROWS.map((r, i) => `*${i + 1}* — ${r.title}`).join('\n') +
        `\n\nOu digite sua dúvida normalmente que eu te atendo. 😊`;
      try {
        if (!listOk) {
          await evo.sendMessage(remoteJid, textMenu);
        }
      } catch (e: any) {
        console.error('[Webhook] envio do menu de texto também falhou:', e?.message);
      }

      // Registra como mensagem da IA no histórico
      await pool.query(
        'INSERT INTO messages (text, sender, type, remote_jid, contact_name) VALUES ($1, $2, $3, $4, $5)',
        [listOk ? '[Menu de atalhos enviado ao cliente]' : textMenu, 'ai', 'text', remoteJid, pushName]
      );

      // Menu enviado — não chamamos a IA neste turno; aguardamos a escolha do cliente.
      return;
    }

    let mediaData = undefined;
    if (isImage || isAudio) {
       console.log(`[Webhook] Baixando midia (${isImage ? 'image' : 'audio'}) do Evolution...`);
       const t0 = Date.now();
       try {
         const settings = await pool.query('SELECT key, value FROM settings WHERE key LIKE $1', ['evolution_%']);
         const config: any = {}; settings.rows.forEach(r => config[r.key] = r.value);
         const evo = new EvolutionService({ apiUrl: config.evolution_api_url, token: config.evolution_token, instance: config.evolution_instance });
         const media = await evo.loadMedia(data.data.key);
         const elapsed = Date.now() - t0;
         if (media?.base64) {
           const mimeType = (isImage ? msg.imageMessage?.mimetype : msg.audioMessage?.mimetype)
             || (isImage ? 'image/jpeg' : 'audio/ogg');
           mediaData = { data: media.base64.replace(/^data:.*?;base64,/, ""), mimeType };
           console.log(`[Webhook] Midia carregada em ${elapsed}ms (${mimeType}, ${Math.round(mediaData.data.length / 1024)}KB)`);
         } else {
           console.warn(`[Webhook] Evolution loadMedia retornou vazio em ${elapsed}ms — segue sem midia, IA respondera baseado no placeholder`);
         }
       } catch (e: any) {
         const elapsed = Date.now() - t0;
         console.error(`[Webhook] Falha ao carregar midia em ${elapsed}ms:`, e?.message || e);
         // Importante: NAO retorna. Segue pra IA mesmo sem midia — a IA responde
         // baseado no texto placeholder ('[Audio enviado]'/'[Imagem enviada]').
       }
    }

    // Salva lead (contato nao-cliente) em background antes de chamar IA.
    // Se for cliente cadastrado, findCustomerByJid retorna algo e nao upserta.
    // Usa void pra nao bloquear — buildLeadContext vai ler o resultado na proxima mensagem.
    void (async () => {
      try {
        const existingFound = await findCustomerByJid(remoteJid, altJid);
        if (!existingFound) {
          await upsertLead(remoteJid, pushName, storedText, altJid);
        }
      } catch (e) { console.error('[Lead] upsertLead background error:', e); }
    })();

    const isAdmin = await isAdminSender(remoteJid, altJid);
    console.log(`[Webhook] Chamando IA (history: ${chatHistory.length} msgs, midia: ${mediaData ? 'sim' : 'nao'}, altJid: ${altJid ? 'sim' : 'nao'}, admin: ${isAdmin})...`);
    const aiT0 = Date.now();
    const aiResult = await handleAIChat(remoteJid, chatHistory, { name: pushName, altJid, isAdmin }, mediaData);
    console.log(`[Webhook] IA respondeu em ${Date.now() - aiT0}ms: text=${aiResult.text?.length || 0}chars, tools=${aiResult.functionCalls?.length || 0}`);
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

    // Executa as tools que a IA chamou. Conta quantas tiveram efeito (enviaram algo
    // pro cliente). Se NENHUMA enviou nada E a IA nao gerou texto, manda fallback —
    // senao o cliente fica em silencio (caso comum: IA chama send_app_info com app_id
    // que nao existe no catalogo).
    let toolsThatSent = 0;
    for (const call of aiResult.functionCalls) {
      console.log(`[Webhook] IA chamou tool: ${call.name}`, JSON.stringify(call.args || {}).slice(0, 200));
      try {
        if (call.name === 'generate_pix') {
          await handlePixGenerationTool(remoteJid, pushName, call.args.username, call.args.amount);
          toolsThatSent++;
        } else if (call.name === 'register_pix_receipt') {
          let imageStored: string | null = null;
          if (mediaData?.data) {
            const r = await uploadToR2('receipts', mediaData.data, mediaData.mimeType);
            imageStored = r.ok ? r.url : `data:${mediaData.mimeType};base64,${mediaData.data}`;
          }
          await handleRegisterPixReceipt(remoteJid, pushName, call.args.payer_name, call.args.amount, call.args.paid_at, imageStored, altJid);
          // register_pix_receipt nao envia mensagem ao cliente sozinho — IA deve mandar texto junto.
          // Se chegou aqui sem texto da IA, conta como nao-enviado pra acionar o fallback.
        } else if (call.name === 'send_app_info') {
          const ok = await handleSendAppInfo(remoteJid, call.args.app_id, call.args.message);
          if (ok) toolsThatSent++;
        } else if (call.name === 'request_screenshot') {
          const ok = await handleRequestScreenshot(remoteJid, call.args.app_id, call.args.custom_instruction);
          if (ok) toolsThatSent++;
        } else if (call.name === 'register_new_customer') {
          const ok = await handleRegisterNewCustomer(remoteJid, pushName, call.args);
          if (ok) toolsThatSent++;
        } else if (call.name === 'create_test_account') {
          const ok = await handleCreateTestAccount(remoteJid, call.args);
          if (ok) toolsThatSent++;
        } else if (call.name === 'generate_startflix_access') {
          const ok = await handleGenerateStartflixAccess(remoteJid, call.args);
          if (ok) toolsThatSent++;
        } else if (call.name === 'activate_smartone') {
          const ok = await handleActivateSmartOne(remoteJid, call.args.username, call.args.mac);
          if (ok) toolsThatSent++;
        } else if (call.name === 'repair_ibo_pro_playlist') {
          const ok = await handleRepairIboProPlaylist(remoteJid, call.args.username);
          if (ok) toolsThatSent++;
        } else if (call.name === 'repair_ibo_playlist') {
          const ok = await handleRepairIboPlaylist(remoteJid, call.args.username);
          if (ok) toolsThatSent++;
        } else if (call.name === 'repair_vupro_playlist') {
          const ok = await handleRepairVUProPlaylist(remoteJid, call.args.username);
          if (ok) toolsThatSent++;
        } else if (call.name === 'activate_player') {
          const ok = await handleActivatePlayerAccount(remoteJid, call.args);
          if (ok) toolsThatSent++;
        } else if (call.name === 'wareztv_generate_test') {
          const ok = await handleWareztvGenerateTest(remoteJid, call.args);
          if (ok) toolsThatSent++;
        } else if (call.name === 'wareztv_create_client') {
          const ok = await handleWareztvCreateClient(remoteJid, call.args);
          if (ok) toolsThatSent++;
        } else if (call.name === 'warez_activate_app') {
          const ok = await handleWareztvActivateApp(remoteJid, call.args);
          if (ok) toolsThatSent++;
        } else if (call.name === 'admin_register_app') {
          // Defesa: só executa se quem fala for realmente admin
          if (!isAdmin) {
            console.warn('[Webhook] admin_register_app chamada por NÃO-admin — ignorada.');
          } else {
            const ok = await handleAdminRegisterApp(remoteJid, call.args);
            if (ok) toolsThatSent++;
          }
        } else {
          console.warn(`[Webhook] Tool desconhecida: ${call.name}`);
        }
      } catch (e: any) {
        console.error(`[Webhook] tool ${call.name} falhou:`, e?.message || e);
      }
    }

    // Fallback: IA so chamou tools mas nenhuma enviou nada visivel pro cliente.
    // Envia um texto generico pro cliente nao ficar no escuro.
    if (!aiResult.text && aiResult.functionCalls.length > 0 && toolsThatSent === 0) {
      console.warn('[Webhook] IA chamou tool(s) mas nenhuma enviou resposta — mandando fallback');
      try {
        const evo = await getEvolutionService();
        await evo.sendMessage(remoteJid, '😕 Desculpa, tive um probleminha pra responder essa. Pode me dizer o que voce precisa?');
      } catch (e: any) {
        console.error('[Webhook] sendMessage fallback falhou:', e?.message);
      }
    }

    // Recomputa memoria IA em background (cooldown 30 min — nao bloqueia resposta).
    void (async () => {
      try {
        const custFound = await findCustomerByJid(remoteJid, altJid);
        await maybeRecomputeAISummary(remoteJid, custFound ? 'customer' : 'lead', altJid);
      } catch (e) { console.error('[AI Memory] background recompute error:', e); }
    })();

  } catch (err: any) { console.error('[Webhook Error]', err); }
});

async function handleRegisterPixReceipt(
  remoteJid: string,
  pushName: string,
  payerName: string,
  amount: number,
  paidAt: string,
  imageDataUri: string | null,
  altJid?: string | null
) {
  try {
    // Reusa findCustomerByJid que ja faz match com remoteJidAlt (@lid)
    let customerId: number | null = null;
    let customerUsername: string | null = null;
    const cf = await findCustomerByJid(remoteJid, altJid);
    if (cf) { customerId = cf.customer.id; customerUsername = cf.customer.username; }

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
      const currentRes = await pool.query('SELECT status, username FROM customers WHERE id = $1', [customerId]);
      const wasTeste = currentRes.rows[0]?.status === 'teste';
      const username = currentRes.rows[0]?.username;

      await pool.query(
        `UPDATE customers SET expiration_date = GREATEST(COALESCE(expiration_date, NOW()::date), NOW()::date) + INTERVAL '30 days', status = 'active', last_renewal = NOW(), updated_at = NOW() WHERE id = $1`,
        [customerId]
      );
      console.log(`[Receipt] cliente ${customerUsername} renovado por +30 dias`);

      if (wasTeste && username) {
        console.log(`[Receipt] Cliente ${username} era teste. Ativando linha oficial no CMS...`);
        enqueueJob('create_client', { username });
      }
    } else {
      console.warn(`[Receipt] sem cliente vinculado a ${remoteJid}${altJid ? ' (alt ' + altJid + ')' : ''} — renovacao manual necessaria`);
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

// Helper: instancia o EvolutionService com config do banco
async function getEvolutionService(): Promise<EvolutionService> {
  const settings = await pool.query('SELECT key, value FROM settings WHERE key LIKE $1', ['evolution_%']);
  const config: any = {};
  settings.rows.forEach(r => config[r.key] = r.value);
  return new EvolutionService({
    apiUrl: config.evolution_api_url,
    token: config.evolution_token,
    instance: config.evolution_instance,
  });
}

// Helper: baixa uma URL publica e converte pra base64 (pra enviar via Evolution sendMedia,
// que precisa de base64 no body). Funciona tanto pra URL R2 quanto pra data URI inline.
async function urlToBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    if (url.startsWith('data:')) {
      // ja e data URI: extrai mime e base64
      const match = url.match(/^data:([^;]+);base64,(.+)$/);
      if (match) return { mimeType: match[1], base64: match[2] };
      return null;
    }
    const r = await fetch(url);
    if (!r.ok) {
      console.warn(`[urlToBase64] HTTP ${r.status} ao baixar ${url}`);
      return null;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    const mimeType = r.headers.get('content-type') || 'image/jpeg';
    return { base64: buf.toString('base64'), mimeType };
  } catch (e: any) {
    console.error('[urlToBase64] erro:', e?.message);
    return null;
  }
}

// Tool handler: envia info de um app do catalogo pro cliente.
// Manda a imagem do app + caption com links de download.
// Retorna true se conseguiu enviar algo pro cliente; false caso contrario (caller
// pode usar pra mandar fallback). O fallback "app nao encontrado" e enviado aqui
// mesmo pra IA nao precisar lidar com erro.
async function handleSendAppInfo(remoteJid: string, appId: number, customMessage?: string): Promise<boolean> {
  try {
    const r = await pool.query('SELECT * FROM app_catalog WHERE id = $1 AND is_active = true', [appId]);
    const app = r.rows[0];
    if (!app) {
      console.warn(`[Tool send_app_info] app ${appId} nao encontrado/inativo — pedindo desculpas ao cliente`);
      try {
        const evo = await getEvolutionService();
        await evo.sendMessage(remoteJid, '😕 Ops, um momento — vou te passar a info correta. Pode me dizer pra qual aparelho voce quer assistir (TV, celular, PC)?');
        return true;
      } catch { return false; }
    }
    const lines = [customMessage?.trim() || `📱 *${app.name}*`].filter(Boolean);
    if (app.description) lines.push(app.description);
    const links: string[] = [];
    if (app.android_link) links.push(`Android: ${app.android_link}`);
    if (app.ios_link) links.push(`iOS: ${app.ios_link}`);
    if (app.web_link) links.push(`Web: ${app.web_link}`);
    if (links.length > 0) {
      lines.push('');
      lines.push('📥 *Baixar:*');
      lines.push(...links);
    }
    const caption = lines.join('\n');

    const evo = await getEvolutionService();
    if (app.app_image_url) {
      const img = await urlToBase64(app.app_image_url);
      if (img) {
        await evo.sendMedia(remoteJid, img.base64, caption, `${app.name}.${img.mimeType.split('/')[1] || 'jpg'}`);
        console.log(`[Tool] send_app_info: enviou ${app.name} pro ${remoteJid}`);
      } else {
        console.warn(`[Tool send_app_info] imagem ${app.app_image_url} nao baixou, enviando so texto`);
        await evo.sendMessage(remoteJid, caption);
      }
    } else {
      await evo.sendMessage(remoteJid, caption);
      console.log(`[Tool] send_app_info: enviou ${app.name} (texto-only) pro ${remoteJid}`);
    }

    // Envia link do YouTube de instalação (se cadastrado)
    if (app.youtube_url) {
      await evo.sendMessage(remoteJid,
        `🎬 *Tutorial de instalação — ${app.name}:*\n${app.youtube_url}`
      );
    }

    // Envia vídeo de instalação (se cadastrado)
    if (app.install_video_url) {
      try {
        const vid = await urlToBase64(app.install_video_url);
        if (vid) {
          await evo.sendMedia(remoteJid, vid.base64, `📹 Tutorial de instalação — ${app.name}`, `tutorial_${app.name}.mp4`);
          console.log(`[Tool] send_app_info: enviou vídeo de instalação do ${app.name}`);
        }
      } catch (ve) {
        console.warn(`[Tool send_app_info] falha ao enviar vídeo de ${app.name}:`, ve);
      }
    }

    // Envia imagens tutoriais (1 a 5, se cadastradas) na ordem
    const tutorialImages = [
      app.image_1_url, app.image_2_url, app.image_3_url, app.image_4_url, app.image_5_url,
    ].filter((u: string | null) => !!u);
    for (let i = 0; i < tutorialImages.length; i++) {
      try {
        const tImg = await urlToBase64(tutorialImages[i]);
        if (tImg) {
          const cap = `📸 Passo ${i + 1} — ${app.name}`;
          await evo.sendMedia(remoteJid, tImg.base64, cap, `passo_${i + 1}_${app.name}.${tImg.mimeType.split('/')[1] || 'jpg'}`);
          console.log(`[Tool] send_app_info: enviou imagem ${i + 1} do ${app.name}`);
        }
      } catch (ie) {
        console.warn(`[Tool send_app_info] falha ao enviar imagem ${i + 1} de ${app.name}:`, ie);
      }
    }

    return true;
  } catch (e: any) {
    console.error('[Tool send_app_info] erro:', e?.message);
    return false;
  }
}

async function handleRequestScreenshot(remoteJid: string, appId: number, customInstruction?: string): Promise<boolean> {
  try {
    const r = await pool.query('SELECT * FROM app_catalog WHERE id = $1 AND is_active = true', [appId]);
    const app = r.rows[0];
    if (!app) {
      console.warn(`[Tool request_screenshot] app ${appId} nao encontrado/inativo — pedindo desculpas`);
      try {
        const evo = await getEvolutionService();
        await evo.sendMessage(remoteJid, '😕 Um momento — me diz qual app voce esta usando que eu te ajudo melhor.');
        return true;
      } catch { return false; }
    }
    const lines = [
      `📸 *Preciso de um print do ${app.name}*`,
      customInstruction?.trim() || app.example_instruction || 'Me manda print da tela igual essa imagem 👇',
    ];
    const caption = lines.join('\n');

    const evo = await getEvolutionService();
    if (app.example_image_url) {
      const img = await urlToBase64(app.example_image_url);
      if (img) {
        await evo.sendMedia(remoteJid, img.base64, caption, `exemplo-${app.name}.${img.mimeType.split('/')[1] || 'jpg'}`);
        console.log(`[Tool] request_screenshot: enviou exemplo de ${app.name} pro ${remoteJid}`);
        return true;
      }
    }
    await evo.sendMessage(remoteJid, caption);
    console.log(`[Tool] request_screenshot: enviou instrucao de ${app.name} (sem imagem) pro ${remoteJid}`);
    return true;
  } catch (e: any) {
    console.error('[Tool request_screenshot] erro:', e?.message);
    return false;
  }
}

/**
 * Cadastra um cliente novo que a IA coletou via fluxo de prospeccao.
 *
 * Cria entrada em `customers` (status=pending até pagamento), associa o WhatsApp,
 * e cadastra um `customer_apps` ja preenchido com MAC/Key/etc — pra quando voce
 * for ativar pelo painel admin, o app ja esta la pronto.
 *
 * Status do customer fica 'pending' (NAO active) — vira active quando voce confirmar
 * pagamento ou rodar a automacao de ativacao. Isso evita "clientes fantasmas" que
 * pediram mas nunca pagaram.
 *
 * Envia confirmacao ao cliente listando os dados que registrou.
 */
async function handleRegisterNewCustomer(remoteJid: string, pushName: string, args: any): Promise<boolean> {
  try {
    const fullName: string = (args.full_name || pushName || '').trim();
    const username: string = (args.desired_username || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const appId = Number(args.app_id);
    const mac = (args.mac_address || '').trim();
    const key = (args.device_key || '').trim();
    const appUser = (args.app_username || '').trim();
    const appPass = (args.app_password || '').trim();
    const deviceType = (args.device_type || '').trim().toLowerCase();

    if (!fullName || !username || !appId) {
      console.warn('[Tool register_new_customer] dados insuficientes:', { fullName: !!fullName, username: !!username, appId });
      try {
        const evo = await getEvolutionService();
        await evo.sendMessage(remoteJid, '😕 Faltam algumas informacoes pra finalizar. Pode confirmar seu nome completo e o app que voce instalou?');
        return true;
      } catch { return false; }
    }

    // Busca o app no catalogo pra puxar o nome/modelo
    const catRes = await pool.query('SELECT * FROM app_catalog WHERE id = $1', [appId]);
    const catalogApp = catRes.rows[0];
    if (!catalogApp) {
      console.warn(`[Tool register_new_customer] app_id ${appId} nao existe no catalogo`);
      try {
        const evo = await getEvolutionService();
        await evo.sendMessage(remoteJid, '😕 Tive um problema pra identificar o app. Pode me dizer de novo qual app voce esta usando?');
        return true;
      } catch { return false; }
    }

    // Garante username unico no banco (sufixo numerico se ja existir)
    let finalUsername = username;
    let suffix = 1;
    while (true) {
      const existing = await pool.query('SELECT id FROM customers WHERE username = $1', [finalUsername]);
      if (!existing.rows[0]) break;
      finalUsername = `${username}${suffix}`;
      suffix++;
      if (suffix > 99) { finalUsername = `${username}${Date.now() % 10000}`; break; }
    }

    const isTv = deviceType === 'tv' || catalogApp.device_type === 'tv';

    // Cria customer (status=pending — ativa quando o admin confirmar pagamento)
    const custRes = await pool.query(
      `INSERT INTO customers (username, name, whatsapp, status, lines_count)
       VALUES ($1, $2, $3, 'pending', 1) RETURNING id`,
      [finalUsername, fullName, '+' + normalizePhone(remoteJid)]
    );
    const customerId = custRes.rows[0].id;

    // Cria customer_app com os dados coletados
    const accessType = mac || key ? 'mac_key' : 'user_pass';
    await pool.query(
      `INSERT INTO customer_apps (customer_id, app_name, app_model, access_type, mac_address, device_key, username, password, android_link, ios_link, is_tv)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        customerId,
        catalogApp.name,                    // app_name (ex: "FUN PLAY")
        catalogApp.name,                    // app_model
        accessType,
        mac || null,
        key || null,
        appUser || null,
        appPass || null,
        catalogApp.android_link || null,
        catalogApp.ios_link || null,
        isTv,
      ]
    );

    console.log(`[Tool] register_new_customer: cadastrou ${finalUsername} (${fullName}) com app ${catalogApp.name}`);

    // Confirma pro cliente
    const lines = [
      `✅ *Pedido registrado!* Dados que anotei:`,
      `Nome: ${fullName}`,
      `Login do plano: ${finalUsername}`,
      `App: ${catalogApp.name}`,
    ];
    if (mac) lines.push(`MAC: ${mac}`);
    if (key) lines.push(`Device Key: ${key}`);
    if (appUser) lines.push(`Usuario do app: ${appUser}`);
    lines.push('');
    lines.push('Agora vou te mandar o Pix da primeira mensalidade. Assim que confirmar o pagamento, ativo o app na sua tela. 🎬');

    try {
      const evo = await getEvolutionService();
      await evo.sendMessage(remoteJid, lines.join('\n'));
    } catch (e: any) {
      console.error('[Tool register_new_customer] envio confirmacao falhou:', e?.message);
    }
    return true;
  } catch (e: any) {
    console.error('[Tool register_new_customer] erro:', e?.message);
    try {
      const evo = await getEvolutionService();
      await evo.sendMessage(remoteJid, '😕 Tive um problema pra registrar agora. Pode tentar de novo daqui a pouco?');
    } catch {}
    return false;
  }
}

/**
 * Tool handler: cria teste gratis de 6h no CMS + ativa o player com MAC.
 * Tudo em um unico job que vai pro worker no PC.
 *
 * Fluxo da experiencia do cliente:
 *   1. IA chama essa tool quando tem player + MAC do cliente novo
 *   2. Cliente recebe "🎬 Estou criando seu teste de 6h gratis. Aguarde uns 30s..."
 *   3. Worker no PC abre Chrome, faz tudo no CMS (cliente novo + ativa player)
 *   4. Quando termina: cliente recebe "✅ Pronto! Abre o app que ja vai funcionar"
 *      (se falhar: "❌ Tive um problema — vou chamar o operador humano")
 *
 * Como nao podemos esperar (o worker pode demorar minutos), envia mensagem
 * de inicio sincronamente, dispara o job em background com .then() callback
 * que manda a mensagem final.
 */
async function handleCreateTestAccount(remoteJid: string, args: any): Promise<boolean> {
  try {
    const playerName: string = (args.player_name || '').trim();
    const mac: string = (args.mac || '').trim();
    const username: string = (args.username || '').trim();

    if (!playerName || !mac) {
      console.warn('[Tool create_test_account] dados incompletos:', { playerName: !!playerName, mac: !!mac });
      try {
        const evo = await getEvolutionService();
        await evo.sendMessage(remoteJid, '😕 Pra criar o teste preciso confirmar: qual o app exato que voce instalou e qual o MAC que aparece nele?');
        return true;
      } catch { return false; }
    }

    // Valida que e um dos players suportados (caso a IA invente um nome)
    const validPlayers = ['ultra player', 'fun play', 'lazer play', 'x-cloud', 'xcloud', 'see play', 'smartone', 'smart-one', 'smart one', 'vu player pro', 'vupro', 'vu player'];
    const playerLower = playerName.toLowerCase();
    if (!validPlayers.some(p => playerLower.includes(p.replace('-', '')) || playerLower.includes(p))) {
      console.warn(`[Tool create_test_account] player invalido: "${playerName}"`);
      try {
        const evo = await getEvolutionService();
        await evo.sendMessage(remoteJid, `😕 Nao reconheco o player "${playerName}". Os disponiveis sao: Ultra Player, Fun Play, Lazer Play, X-Cloud, See Play, SmartOne, VU Player Pro. Qual deles voce instalou?`);
        return true;
      } catch { return false; }
    }

    // Avisa o cliente que vai demorar uns segundos
    const evo = await getEvolutionService();
    await evo.sendMessage(
      remoteJid,
      `🎬 Show! Estou criando seu teste GRATIS de 6 horas no ${playerName} com MAC ${mac}.\n\nAguarda uns 30 segundinhos que o app ja vai funcionar na tua tela...`
    );

    // Dispara o job em BACKGROUND — nao espera, senao o webhook handler segura
    // tudo por minutos. Quando terminar, callback notifica o cliente.
    (async () => {
      try {
        const finalUsername = sanitizeTestUsername(username);
        const deviceKey: string = (args.device_key || args.deviceKey || '').trim();
        const jobId = await enqueueJob('create_test', { username: finalUsername, mac, playerName, deviceKey });
        // waitForJob bloqueia ate 5min — esta dentro de IIFE async, nao trava o handler principal
        const result: any = await waitForJob(jobId);
        const evo2 = await getEvolutionService();

        if (result?.success) {
          const finalUser = result.username || finalUsername || 'cliente';
          const finalPass = result.password || '';
          const passLine = finalPass ? `Senha: *${finalPass}*\n` : '';
          const androidBlock = finalPass
            ? `\n\n📱 *No celular Android* tambem da pra usar — baixa o app *Master Player Pro* na Play Store e entra com esse mesmo usuario e senha:\nhttps://play.google.com/store/apps/details?id=masterP.pro.com`
            : '';
          await evo2.sendMessage(
            remoteJid,
            `✅ *Seu teste esta ativo!*\n\nUsuario: *${finalUser}*\n${passLine}App ativado: ${playerName} (MAC ${mac})\n\n⏰ Voce tem *6 horas* pra testar tudo. Abre o ${playerName} ai na tua TV e ja vai estar funcionando!${androidBlock}\n\nGostou? Me chama aqui que ativo seu plano definitivo. 🎬`
          );
        } else {
          await evo2.sendMessage(
            remoteJid,
            `😕 Nao consegui ativar seu teste agora. Vou chamar o operador pra resolver pra voce em alguns minutos. Pode aguardar?`
          );
        }
      } catch (e: any) {
        console.error('[Tool create_test_account] background falhou:', e?.message);
        try {
          const evo3 = await getEvolutionService();
          await evo3.sendMessage(remoteJid, '😕 Encontrei um problema tecnico. Vou avisar o operador pra te ajudar pessoalmente — ele te chama logo logo.');
        } catch {}
      }
    })();

    return true; // mensagem inicial ja foi enviada
  } catch (e: any) {
    console.error('[Tool create_test_account] erro:', e?.message);
    return false;
  }
}

/**
 * Tool handler: gera um código de acesso de cortesia (SEM expiração) pro app StartFlix.
 * Envia o app StartFlix (do catálogo) pra baixar + o código. O cliente entra no app
 * por "Tenho um código de acesso" e o pool M3U atribui uma lista automaticamente.
 */
async function handleGenerateStartflixAccess(remoteJid: string, args: any): Promise<boolean> {
  try {
    const evo = await getEvolutionService();

    // 1. Gera código de cortesia. Códigos NÃO expiram (tabela não tem expiração) —
    //    ficam ativos até serem desativados no painel. É a cortesia pedida.
    let code = generateM3uCode();
    const phone = remoteJid.split('@')[0];
    const note  = (args?.note || '').toString().trim();
    const label = note ? `Cortesia ${note}` : `Cortesia WhatsApp ${phone}`;
    for (let i = 0; i < 4; i++) {
      const ins = await pool.query(
        `INSERT INTO m3u_access_codes (code, label) VALUES ($1, $2)
         ON CONFLICT (code) DO NOTHING RETURNING id`,
        [code, label]
      );
      if (ins.rows[0]) break;
      code = generateM3uCode(); // colisão rara — tenta outro
    }
    console.log(`[Tool generate_startflix_access] código ${code} (cortesia) gerado para ${remoteJid}`);

    // 2. Busca o app StartFlix cadastrado no catálogo (aba APPS)
    const appRes = await pool.query(
      `SELECT id FROM app_catalog
       WHERE is_active = true AND LOWER(name) LIKE '%startflix%'
       ORDER BY display_order ASC LIMIT 1`
    );
    const app = appRes.rows[0];

    // 3. Envia o app StartFlix pra baixar (imagem + links + tutorial), com mensagem de cortesia
    if (app) {
      await handleSendAppInfo(remoteJid, app.id, '🎁 *Conheça nosso conteúdo!* Baixe nosso app gratuito *StartFlix*:');
    } else {
      console.warn('[Tool generate_startflix_access] app StartFlix não encontrado no catálogo');
    }

    // 4. Envia o código de acesso de cortesia
    const codeMsg =
`🔑 *Seu código de acesso de cortesia:*\n\n*${code}*\n\nÉ só abrir o *StartFlix*, tocar em *"Tenho um código de acesso"* e digitar esse código. Sem cadastro e sem prazo — acesse quando quiser pra conhecer nosso conteúdo! 🎬\n\nGostou? Me chama aqui que monto seu plano completo. 😉`;
    await evo.sendMessage(remoteJid, codeMsg);

    return true;
  } catch (e: any) {
    console.error('[Tool generate_startflix_access] erro:', e?.message);
    return false;
  }
}

/**
 * Anti-spam: registra quando a tool repair_ibo_pro_playlist foi executada
 * pra cada cliente. Se chamada de novo dentro de REPAIR_COOLDOWN_MS, retorna
 * mensagem amigavel em vez de re-executar.
 *
 * Cenario classico: IA repara → cliente agradece "deu certo" → IA chama de novo
 * por engano. Esse cooldown evita o loop.
 */
const _lastRepair = new Map<string, number>();
const REPAIR_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Tool handler: ativa um player para cliente existente.
 */
async function handleActivatePlayerAccount(remoteJid: string, args: any): Promise<boolean> {
  try {
    const playerName: string = (args.player_name || '').trim();
    const mac: string = (args.mac || '').trim();
    const username: string = (args.username || '').trim();

    if (!playerName || !mac || !username) return false;

    const playerLower = playerName.toLowerCase();
    let playerType = 'ultra';
    if (playerLower.includes('fun')) playerType = 'funplay';
    else if (playerLower.includes('cloud')) playerType = 'xcloud';
    else if (playerLower.includes('lazer')) playerType = 'lazerplay';
    else if (playerLower.includes('see')) playerType = 'seeplay';

    const evo = await getEvolutionService();
    await evo.sendMessage(remoteJid, `⚙️ Entendido! Vou ativar o *${playerName}* no seu acesso agora mesmo (MAC/Código: ${mac}).\n\nAguarde uns 30 segundinhos...`);

    (async () => {
      try {
        const jobId = await enqueueJob(`activate_${playerType}`, { username, mac });
        const result: any = await waitForJob(jobId);
        const evo2 = await getEvolutionService();

        if (result?.success) {
          await evo2.sendMessage(remoteJid, `✅ *Pronto!* Seu player *${playerName}* foi ativado com sucesso.\n\nPode abrir o app agora e testar! 🎬`);
          await pool.query(
            `INSERT INTO customer_apps (customer_id, app_name, app_model, access_type, mac_address, username)
             SELECT id, $2, $3, 'mac_key', $4, $5 FROM customers WHERE username = $1
             ON CONFLICT DO NOTHING`,
            [username, playerName, playerName, mac, username]
          );
        } else {
          await evo2.sendMessage(remoteJid, `😕 Nao consegui ativar agora. O suporte humano já foi avisado e vai resolver pra você.`);
        }
      } catch (e: any) { console.error('[Tool activate_player] background falhou:', e?.message); }
    })();

    return true;
  } catch (e) { return false; }
}

/**
 * Anti-spam: registra quando a tool repair_ibo_pro_playlist foi executada
 *
 * Fluxo:
 *   1. Checa cooldown — se rodou ha <5min, manda mensagem de confirmacao em vez
 *      de re-executar (evita IA disparar de novo quando cliente so agradece)
 *   2. Avisa cliente "vou atualizar sua lista, aguarda 1-2min..."
 *   3. Background: busca dados do cliente (M3U + MAC + Key do app IBO PRO)
 *      e enfileira job ibo_pro_setup pro worker
 *   4. Quando termina, manda mensagem final (sucesso ou erro)
 *
 * Mesmo padrao do handleCreateTestAccount — fire-and-forget pra nao travar
 * o webhook handler por minutos.
 */
async function handleRepairIboProPlaylist(remoteJid: string, username: string): Promise<boolean> {
  try {
    // Anti-spam: se ja rodou recente, nao re-executa
    const lastRun = _lastRepair.get(remoteJid);
    if (lastRun && (Date.now() - lastRun) < REPAIR_COOLDOWN_MS) {
      const minutesAgo = Math.round((Date.now() - lastRun) / 60_000);
      console.log(`[Tool repair_ibo_pro_playlist] BLOQUEADO — ja rodou ha ${minutesAgo}min pro ${remoteJid}`);
      try {
        const evo = await getEvolutionService();
        await evo.sendMessage(remoteJid, `😊 Acabei de atualizar sua lista ha ${minutesAgo} minuto(s)! Se ainda nao funcionou, abre o app e fecha de novo. Aguarda mais uns segundinhos e tenta.`);
        return true;
      } catch { return false; }
    }

    if (!username) {
      console.warn('[Tool repair_ibo_pro_playlist] sem username');
      try {
        const evo = await getEvolutionService();
        await evo.sendMessage(remoteJid, '😕 Preciso saber qual seu usuario pra atualizar a lista. Pode me confirmar?');
        return true;
      } catch { return false; }
    }

    // Valida que o cliente tem app IBO PRO + M3U cadastrados ANTES de avisar
    // (evita avisar "vou atualizar" e depois "falhou" se faltam dados basicos)
    const custRes = await pool.query('SELECT id, playlist_url FROM customers WHERE username = $1', [username]);
    const customer = custRes.rows[0];
    if (!customer) {
      try {
        const evo = await getEvolutionService();
        await evo.sendMessage(remoteJid, `😕 Nao achei seu cadastro pelo usuario "${username}". Pode confirmar?`);
        return true;
      } catch { return false; }
    }
    if (!customer.playlist_url) {
      try {
        const evo = await getEvolutionService();
        await evo.sendMessage(remoteJid, '😕 Vi seu cadastro mas falta sua URL de lista. Vou chamar o operador pra resolver.');
        return true;
      } catch { return false; }
    }

    const appsRes = await pool.query(
      `SELECT app_name, app_model, mac_address, device_key FROM customer_apps WHERE customer_id = $1`,
      [customer.id]
    );
    const iboApp = appsRes.rows.find((a: any) => {
      const m = (a.app_model || '').toUpperCase();
      const n = (a.app_name || '').toUpperCase();
      return m.includes('IBO PRO') || n.includes('IBO PRO');
    });
    if (!iboApp || !iboApp.mac_address || !iboApp.device_key) {
      try {
        const evo = await getEvolutionService();
        await evo.sendMessage(remoteJid, '😕 Pra atualizar preciso do MAC e Device Key do seu IBO Pro. Pode me passar?');
        return true;
      } catch { return false; }
    }

    // Marca timestamp ANTES de avisar/disparar pra cobrir corrida com mensagens proximas
    _lastRepair.set(remoteJid, Date.now());

    // Avisa cliente que vai demorar
    const evo = await getEvolutionService();
    await evo.sendMessage(
      remoteJid,
      `🔧 Vou atualizar sua lista no IBO Pro agora.\n\nMAC: ${iboApp.mac_address}\n\nIsso leva uns 1-2min. Quando terminar, vou te avisar e ja vai voltar a funcionar. 🎬`
    );

    // Dispara o job em background — nao espera, senao trava o webhook por minutos
    (async () => {
      try {
        const jobId = await enqueueJob('ibo_pro_setup', {
          mac: iboApp.mac_address,
          key: iboApp.device_key,
          playlistUrl: customer.playlist_url,
        });
        const result: any = await waitForJob(jobId);
        const evo2 = await getEvolutionService();

        if (result?.success) {
          await evo2.sendMessage(
            remoteJid,
            `✅ Pronto! Sua lista foi atualizada no IBO Pro. Abre o app ai na sua tela que ja vai estar funcionando. 🎬\n\nSe precisar de algo, e so chamar.`
          );
        } else {
          await evo2.sendMessage(
            remoteJid,
            `😕 Nao consegui atualizar sua lista agora. Vou avisar o operador pra resolver pessoalmente.`
          );
        }
      } catch (e: any) {
        console.error('[Tool repair_ibo_pro_playlist] background falhou:', e?.message);
        try {
          const evo3 = await getEvolutionService();
          await evo3.sendMessage(remoteJid, '😕 Tive um problema tecnico ao atualizar. O operador ja foi avisado e te chama logo.');
        } catch {}
      }
    })();

    return true;
  } catch (e: any) {
    console.error('[Tool repair_ibo_pro_playlist] erro:', e?.message);
    return false;
  }
}

/**
 * Tool handler: Verifica e repara lista no IBO Player/IPTV (iboplayer.com / iboiptv.com).
 */
async function handleRepairIboPlaylist(remoteJid: string, username: string): Promise<boolean> {
  try {
    if (!username) {
      try {
        const evo = await getEvolutionService();
        await evo.sendMessage(remoteJid, '😕 Preciso saber seu usuario pra verificar sua lista IBO. Pode me confirmar?');
        return true;
      } catch { return false; }
    }

    const custRes = await pool.query('SELECT id, playlist_url FROM customers WHERE username = $1', [username]);
    const customer = custRes.rows[0];
    if (!customer) {
      try {
        const evo = await getEvolutionService();
        await evo.sendMessage(remoteJid, `😕 Nao achei seu cadastro com o usuario "${username}". Pode confirmar?`);
        return true;
      } catch { return false; }
    }

    const appsRes = await pool.query(
      `SELECT app_name, app_model, mac_address, device_key FROM customer_apps WHERE customer_id = $1`,
      [customer.id]
    );
    const iboApp = appsRes.rows.find((a: any) => {
      const m = (a.app_model || '').toUpperCase();
      const n = (a.app_name || '').toUpperCase();
      return m.includes('IBO PLAYER') || n.includes('IBO PLAYER') || m.includes('IBO IPTV') || n.includes('IBO IPTV');
    });

    if (!iboApp || !iboApp.mac_address || !iboApp.device_key) {
      try {
        const evo = await getEvolutionService();
        await evo.sendMessage(remoteJid, '😕 Pra atualizar o IBO Player preciso do seu MAC e Device Key. Pode me passar?');
        return true;
      } catch { return false; }
    }

    const evo = await getEvolutionService();
    await evo.sendMessage(
      remoteJid,
      `🔧 Vou verificar seu sinal no IBO agora.\n\nMAC: ${iboApp.mac_address}\n\nIsso leva uns 1-2min. Ja te aviso o que encontrei! 🎬`
    );

    (async () => {
      try {
        const jobId = await enqueueJob('ibo_repair', {
          mac: iboApp.mac_address,
          key: iboApp.device_key,
          playlistUrl: customer.playlist_url || '',
        });
        const result: any = await waitForJob(jobId);
        const evo2 = await getEvolutionService();

        if (result?.success) {
          await evo2.sendMessage(remoteJid, result.message || '✅ Verificacao concluida.');
        } else {
          await evo2.sendMessage(
            remoteJid,
            `😕 Nao consegui verificar sua lista agora. O suporte ja foi avisado e vai te ajudar.`
          );
        }
      } catch (e: any) {
        console.error('[Tool repair_ibo_playlist] background falhou:', e?.message);
      }
    })();

    return true;
  } catch (e: any) {
    console.error('[Tool repair_ibo_playlist] erro:', e?.message);
    return false;
  }
}

/**
 * Tool handler: Verifica e repara lista no VU Player Pro (vuproplayer.com).
 */
async function handleRepairVUProPlaylist(remoteJid: string, username: string): Promise<boolean> {
  try {
    if (!username) {
      try {
        const evo = await getEvolutionService();
        await evo.sendMessage(remoteJid, '😕 Preciso saber seu usuario pra verificar sua lista VU Player Pro. Pode me confirmar?');
        return true;
      } catch { return false; }
    }

    const custRes = await pool.query('SELECT id, playlist_url FROM customers WHERE username = $1', [username]);
    const customer = custRes.rows[0];
    if (!customer) {
      try {
        const evo = await getEvolutionService();
        await evo.sendMessage(remoteJid, `😕 Nao achei seu cadastro com o usuario "${username}". Pode confirmar?`);
        return true;
      } catch { return false; }
    }

    const appsRes = await pool.query(
      `SELECT app_name, app_model, mac_address, device_key FROM customer_apps WHERE customer_id = $1`,
      [customer.id]
    );
    const vuApp = appsRes.rows.find((a: any) => {
      const m = (a.app_model || '').toUpperCase();
      const n = (a.app_name || '').toUpperCase();
      return m.includes('VU') || n.includes('VU');
    });

    if (!vuApp || !vuApp.mac_address || !vuApp.device_key) {
      try {
        const evo = await getEvolutionService();
        await evo.sendMessage(remoteJid, '😕 Pra atualizar o VU Player Pro preciso do seu MAC e Senha/Device Key. Pode me passar?');
        return true;
      } catch { return false; }
    }

    const evo = await getEvolutionService();
    await evo.sendMessage(
      remoteJid,
      `🔧 Vou verificar e atualizar seu sinal no VU Player Pro agora.\n\nMAC: ${vuApp.mac_address}\n\nIsso leva uns 1-2min. Ja te aviso o que encontrei! 🎬`
    );

    (async () => {
      try {
        const jobId = await enqueueJob('vupro_setup', {
          mac: vuApp.mac_address,
          deviceKey: vuApp.device_key,
          playlistUrl: customer.playlist_url || '',
          listName: username || 'Teste',
        });
        const result: any = await waitForJob(jobId);
        const evo2 = await getEvolutionService();

        if (result?.success) {
          await evo2.sendMessage(remoteJid, result.message || '✅ Verificacao e atualizacao no VU Player Pro concluida.');
        } else {
          await evo2.sendMessage(
            remoteJid,
            `😕 Nao consegui atualizar sua lista no VU Player Pro agora. O suporte ja foi avisado e vai te ajudar.`
          );
        }
      } catch (e: any) {
        console.error('[Tool repair_vupro_playlist] background falhou:', e?.message);
      }
    })();

    return true;
  } catch (e: any) {
    console.error('[Tool repair_vupro_playlist] erro:', e?.message);
    return false;
  }
}


/**
 * Tool handler: Adiciona playlist do cliente no SmartOne automaticamente.
 */
async function handleActivateSmartOne(remoteJid: string, username: string, mac: string): Promise<boolean> {
  try {
    if (!mac) {
      const evo = await getEvolutionService();
      await evo.sendMessage(remoteJid, '📺 Pra configurar o SmartOne preciso do MAC do seu aparelho. Consegue me passar?');
      return true;
    }

    const custRes = await pool.query('SELECT id, name, playlist_url FROM customers WHERE username = $1', [username]);
    const customer = custRes.rows[0];
    if (!customer || !customer.playlist_url) {
      const evo = await getEvolutionService();
      await evo.sendMessage(remoteJid, '😕 Nao encontrei sua playlist no sistema. Confirma seu usuario pra eu verificar?');
      return true;
    }

    const listName = customer.name ? `${customer.name} - SmartOne` : `Cliente - SmartOne`;

    const evo = await getEvolutionService();
    await evo.sendMessage(
      remoteJid,
      `📺 Vou configurar o SmartOne pra voce agora!\n\nMAC: ${mac}\n\nIsso leva uns instantes... ja te aviso quando estiver pronto! 🎬`
    );

    // Executa em background para não bloquear
    (async () => {
      try {
        const jobId = await enqueueJob('smartone_setup', {
          mac,
          listName,
          playlistUrl: customer.playlist_url,
        });
        const result: any = await waitForJob(jobId);
        const evo2 = await getEvolutionService();

        if (result?.success) {
          await evo2.sendMessage(
            remoteJid,
            `✅ Pronto! Sua playlist foi adicionada no SmartOne com sucesso.\n\nAbra o app, selecione a lista e aproveite! 🎬\n\nQualquer duvida e so chamar.`
          );
        } else {
          await evo2.sendMessage(
            remoteJid,
            `😕 Tive um problema ao configurar o SmartOne. Ja avisei o suporte e eles vao te ajudar em breve.`
          );
        }
      } catch (e: any) {
        console.error('[Tool activate_smartone] background falhou:', e?.message);
        try {
          const evo3 = await getEvolutionService();
          await evo3.sendMessage(remoteJid, '😕 Tive um problema tecnico. O operador ja foi avisado e te chama logo.');
        } catch {}
      }
    })();

    return true;
  } catch (e: any) {
    console.error('[Tool activate_smartone] erro:', e?.message);
    return false;
  }
}

async function handleWareztvGenerateTest(remoteJid: string, args: any): Promise<boolean> {
  try {
    const evo = await getEvolutionService();
    const notes = args.notes || '';

    await evo.sendMessage(remoteJid, '⏳ Gerando seu teste Wareztv... aguarda um segundo!');

    const line = await warezApi.generateTest(notes);

    // Persiste em wareztv_customers E customers (banco unificado)
    await upsertWarezCustomer({ ...line, is_trial: 1 });

    const expFormatted = line.exp_date
      ? new Date(line.exp_date).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
      : '6 horas';

    await evo.sendMessage(remoteJid,
      `✅ *Teste Wareztv ativado!*\n\n` +
      `👤 Usuário: *${line.username}*\n` +
      `🔑 Senha: *${line.password}*\n` +
      `⏰ Válido até: ${expFormatted}\n\n` +
      `📱 *Configure nos apps:*\n` +
      `• *Krator* — o melhor pra TV e celular\n` +
      `• *Wplay* — app oficial do provedor\n\n` +
      `No app, escolha a opção *"Entrar com usuário e senha"* e use as credenciais acima.\n\n` +
      `Gostou? Me chama que faço seu plano mensal! 🎬`
    );

    return true;
  } catch (e: any) {
    console.error('[Tool wareztv_generate_test] erro:', e?.message);
    try {
      const evo = await getEvolutionService();
      await evo.sendMessage(remoteJid, '😕 Tive um problema ao gerar seu teste. Tenta de novo em instantes!');
    } catch {}
    return false;
  }
}

async function handleWareztvCreateClient(remoteJid: string, args: any): Promise<boolean> {
  try {
    const evo = await getEvolutionService();
    const { name, whatsapp, days } = args;

    await evo.sendMessage(remoteJid, '⏳ Criando seu acesso Wareztv...');

    const line = await warezApi.createClient({
      whatsapp: whatsapp || '',
      notes: name || '',
      days: days || 30,
    });

    // Persiste em wareztv_customers E customers (banco unificado)
    await upsertWarezCustomer({ ...line, whatsapp: whatsapp || line.whatsapp }, name || null);

    const expDate = line.exp_date
      ? new Date(line.exp_date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      : `${days || 30} dias`;

    await evo.sendMessage(remoteJid,
      `🎉 *Acesso Wareztv criado com sucesso!*\n\n` +
      `👤 Usuário: *${line.username}*\n` +
      `🔑 Senha: *${line.password}*\n` +
      `📅 Vencimento: ${expDate}\n\n` +
      `📱 *Configure nos apps:*\n` +
      `• *Krator* (recomendado para TVs)\n` +
      `• *Wplay* (app oficial)\n\n` +
      `Entre com usuário e senha. Qualquer dúvida é só me chamar! 🙌`
    );

    return true;
  } catch (e: any) {
    console.error('[Tool wareztv_create_client] erro:', e?.message);
    try {
      const evo = await getEvolutionService();
      await evo.sendMessage(remoteJid, '😕 Tive um problema ao criar o acesso. Contate o suporte.');
    } catch {}
    return false;
  }
}

/**
 * Tool handler: ativa um app de TV (App + Nome da Lista + MAC) na conta Wareztv do cliente.
 */
async function handleWareztvActivateApp(remoteJid: string, args: any): Promise<boolean> {
  try {
    const evo = await getEvolutionService();
    const { username, app_name, mac, list_name } = args || {};

    if (!mac) {
      await evo.sendMessage(remoteJid, '📺 Pra ativar o app preciso do MAC do seu aparelho (ou o Código, dependendo do app). Consegue me passar?');
      return true;
    }

    // Resolve o app pelo nome informado
    const app = warezApi.resolveWarezApp(app_name);
    if (!app) {
      const lista = warezApi.WAREZ_TV_APPS.map(a => a.label).join(', ');
      await evo.sendMessage(remoteJid, `😕 Não reconheci o app "${app_name}". Os apps que consigo ativar são: ${lista}. Qual deles você está usando?`);
      return true;
    }

    // Busca a linha Warez do cliente
    const custRes = await pool.query(
      "SELECT name, warez_line_id FROM customers WHERE LOWER(username) = LOWER($1) AND provider = 'wareztv'",
      [username]
    );
    const customer = custRes.rows[0];
    if (!customer || !customer.warez_line_id) {
      await evo.sendMessage(remoteJid, '😕 Não encontrei sua conta no Wareztv. Confirma seu usuário pra eu verificar?');
      return true;
    }

    const namePlaylist = (list_name && String(list_name).trim())
      || customer.name
      || 'Minha Lista';
    const campo = app.xstream ? 'Código' : 'MAC';

    await evo.sendMessage(remoteJid,
      `📺 Vou ativar o *${app.label}* na sua conta agora!\n\n${campo}: ${mac}\nLista: ${namePlaylist}\n\nSó um instante... 🎬`
    );

    try {
      const result = await warezApi.activateApp(app, namePlaylist, mac, customer.warez_line_id);
      if (result?.success) {
        await evo.sendMessage(remoteJid,
          `✅ Pronto! O *${app.label}* foi ativado com sucesso.\n\nAbra o app no aparelho e a lista *${namePlaylist}* já vai aparecer. Aproveite! 🎬\n\nQualquer dúvida é só chamar.`
        );
      } else {
        await evo.sendMessage(remoteJid, '😕 Não consegui confirmar a ativação. Já avisei o suporte pra te ajudar.');
      }
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('already exists') || msg.toLowerCase().includes('já')) {
        await evo.sendMessage(remoteJid, `ℹ️ Esse ${campo} já estava ativado no *${app.label}*. É só abrir o app que a lista *${namePlaylist}* aparece. 🎬`);
        return true;
      }
      if (msg.includes('não disponivel') || msg.includes('disponivel')) {
        await evo.sendMessage(remoteJid, `😕 O app *${app.label}* não está disponível pra ativação no momento. Quer tentar outro app?`);
        return true;
      }
      console.error('[Tool warez_activate_app] erro API:', msg);
      await evo.sendMessage(remoteJid, '😕 Tive um problema técnico ao ativar o app. O operador já foi avisado e te ajuda logo.');
    }

    return true;
  } catch (e: any) {
    console.error('[Tool warez_activate_app] erro:', e?.message);
    return false;
  }
}

// Normaliza o nome do app pra um app_model que as tools de reparo reconhecem.
function normalizeAppModel(name: string): { app_name: string; app_model: string } {
  const s = (name || '').toLowerCase();
  if (s.includes('ibo') && s.includes('pro')) return { app_name: 'IBO Pro', app_model: 'IBO PRO' };
  if (s.includes('ibo') && s.includes('iptv')) return { app_name: 'IBO IPTV', app_model: 'IBO IPTV' };
  if (s.includes('ibo')) return { app_name: 'IBO Player', app_model: 'IBO PLAYER' };
  if (s.includes('smartone') || s.includes('smart one')) return { app_name: 'SmartOne', app_model: 'SMARTONE' };
  if (s.includes('vu')) return { app_name: 'VU Player Pro', app_model: 'VU PLAYER PRO' };
  if (s.includes('duplex')) return { app_name: 'Duplex Play', app_model: 'DUPLEX PLAY' };
  const clean = (name || '').trim() || 'App';
  return { app_name: clean, app_model: clean.toUpperCase() };
}

/**
 * [ADMIN] Cadastra um app (e opcionalmente o telefone) num cliente existente.
 * Localiza o cliente por username (exato) ou nome (parcial). Se ambíguo, pede pra especificar.
 */
async function handleAdminRegisterApp(remoteJid: string, args: any): Promise<boolean> {
  const evo = await getEvolutionService();
  try {
    const customerQuery = String(args?.customer || '').trim();
    const appName       = String(args?.app_name || '').trim();
    const mac           = String(args?.mac || '').trim() || null;
    const deviceKey     = String(args?.device_key || '').trim() || null;
    const appPassword   = String(args?.password || '').trim() || null;
    const phone         = String(args?.phone || '').replace(/\D/g, '') || null;

    if (!customerQuery || !appName) {
      await evo.sendMessage(remoteJid, '⚙️ Admin: preciso do *cliente* (username/nome) e do *app* pra cadastrar.');
      return true;
    }

    // 1. Localiza o cliente: username exato primeiro, depois nome parcial.
    let rows = (await pool.query(
      'SELECT id, name, username, whatsapp FROM customers WHERE LOWER(username) = LOWER($1) LIMIT 5',
      [customerQuery]
    )).rows;
    if (rows.length === 0) {
      rows = (await pool.query(
        'SELECT id, name, username, whatsapp FROM customers WHERE name ILIKE $1 ORDER BY name LIMIT 10',
        [`%${customerQuery}%`]
      )).rows;
    }

    if (rows.length === 0) {
      await evo.sendMessage(remoteJid, `⚙️ Admin: não achei nenhum cliente com "${customerQuery}". Confere o username/nome.`);
      return true;
    }
    if (rows.length > 1) {
      const lista = rows.map((r: any) => `• ${r.name || '(sem nome)'} — user: *${r.username}*`).join('\n');
      await evo.sendMessage(remoteJid, `⚙️ Admin: achei ${rows.length} clientes com "${customerQuery}":\n${lista}\n\nMe manda o *username* exato pra eu cadastrar no certo.`);
      return true;
    }

    const customer = rows[0];
    const { app_name, app_model } = normalizeAppModel(appName);
    const accessType = mac || deviceKey ? 'mac_key' : 'user_pass';

    // 2. Cadastra o app
    await pool.query(
      `INSERT INTO customer_apps (customer_id, app_name, app_model, access_type, mac_address, device_key, password, is_tv)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
      [customer.id, app_name, app_model, accessType, mac, deviceKey, appPassword]
    );

    // 3. Telefone (se informado): vincula ao cadastro
    let phoneMsg = '';
    if (phone) {
      const curNorm = String(customer.whatsapp || '').replace(/\D/g, '');
      if (!curNorm) {
        await pool.query('UPDATE customers SET whatsapp = $1, updated_at = NOW() WHERE id = $2', [phone, customer.id]);
        phoneMsg = `\n📱 Telefone ${phone} salvo como principal.`;
      } else if (!phoneDigitsMatch(curNorm, phone)) {
        try {
          await pool.query(
            'INSERT INTO customer_phones (customer_id, phone, label) VALUES ($1, $2, $3)',
            [customer.id, phone, customer.name || 'Cliente']
          );
          phoneMsg = `\n📱 Telefone ${phone} vinculado como secundário.`;
        } catch {
          phoneMsg = `\n⚠️ Telefone ${phone} já está vinculado a outro cadastro — não alterei.`;
        }
      } else {
        phoneMsg = `\n📱 Telefone já era esse, mantido.`;
      }
    }

    const detalhes = [
      mac && `MAC: ${mac}`,
      deviceKey && `Key: ${deviceKey}`,
      appPassword && `Senha: ${appPassword}`,
    ].filter(Boolean).join(' | ');

    await evo.sendMessage(remoteJid,
      `✅ Admin: cadastrei *${app_name}* no cliente *${customer.name || customer.username}* (user: ${customer.username}).\n${detalhes || '(sem MAC/senha)'}${phoneMsg}`
    );
    return true;
  } catch (e: any) {
    console.error('[Tool admin_register_app] erro:', e?.message);
    try { await evo.sendMessage(remoteJid, '⚙️ Admin: tive um erro ao cadastrar. Confere os dados e tenta de novo.'); } catch {}
    return false;
  }
}

async function checkAppPayments() {
  if (!supabaseStartflix) return;
  try {
    const { data: payments, error } = await supabaseStartflix
      .from('payments')
      .select('*, profiles!user_id(username, full_name)')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    if (!payments || payments.length === 0) return;

    for (const payment of payments) {
      const paymentId = payment.id;
      const username = payment.profiles?.username || payment.profiles?.full_name;
      if (!username) continue;

      const processedCheck = await pool.query("SELECT 1 FROM processed_app_payments WHERE payment_id = $1", [paymentId]);
      if (processedCheck.rows.length > 0) continue;

      console.log(`[AutoRenewal] Processando pagamento ${paymentId} para ${username}...`);

      const customerRes = await pool.query("SELECT * FROM customers WHERE username = $1", [username]);
      if (customerRes.rows.length === 0) {
        await pool.query("INSERT INTO processed_app_payments (payment_id) VALUES ($1)", [paymentId]);
        continue;
      }

      const customer = customerRes.rows[0];
      const wasTeste = customer.status === 'teste';

      let newExpiration = new Date(customer.expiration_date || new Date());
      if (newExpiration < new Date()) {
        newExpiration = new Date();
      }
      newExpiration.setMonth(newExpiration.getMonth() + 1);

      await pool.query(
        "UPDATE customers SET expiration_date = $1, status = 'active', updated_at = CURRENT_TIMESTAMP, last_renewal = CURRENT_TIMESTAMP, amount_paid = amount_paid + $2 WHERE username = $3",
        [newExpiration.toISOString().split('T')[0], payment.amount, username]
      );

      if (wasTeste) {
        console.log(`[AutoRenewal] Cliente ${username} era teste. Ativando no CMS...`);
        enqueueJob('create_client', { username });
      }

      await pool.query("INSERT INTO processed_app_payments (payment_id) VALUES ($1)", [paymentId]);
      console.log(`[AutoRenewal] Sucesso: ${username} renovado até ${newExpiration.toISOString().split('T')[0]}`);

      await supabaseStartflix
        .from('profiles')
        .update({ expiration_date: newExpiration.toISOString(), is_active: true, has_signal: true })
        .eq('id', payment.user_id);
    }
  } catch (e: any) {
    console.error(`[AutoRenewal] Erro ao verificar pagamentos:`, e.message);
  }
}

// ============================================================
// APP ANDROID — Master Player Pro
// DNS relay + config management + APK download
// ============================================================

/** Fetch from a DNS server with timeout */
async function fetchFromDns(dnsBase: string, path: string, timeoutMs = 6000): Promise<{ok: boolean; body: string; status: number}> {
  return new Promise(resolve => {
    const url = `${dnsBase.replace(/\/$/, '')}${path}`;
    const mod = url.startsWith('https') ? https : http;
    const t = setTimeout(() => resolve({ ok: false, body: '', status: 0 }), timeoutMs);
    try {
      const req = mod.get(url, { timeout: timeoutMs }, res => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          clearTimeout(t);
          resolve({ ok: res.statusCode! < 500, body, status: res.statusCode! });
        });
      });
      req.on('error', () => { clearTimeout(t); resolve({ ok: false, body: '', status: 0 }); });
    } catch { clearTimeout(t); resolve({ ok: false, body: '', status: 0 }); }
  });
}

/** Load DNS list from DB settings */
async function getAppDnsList(): Promise<string[]> {
  try {
    const r = await pool.query("SELECT value FROM settings WHERE key = 'app_dns_list'");
    if (r.rows[0]?.value) {
      const parsed = JSON.parse(r.rows[0].value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    }
  } catch {}
  return [];
}

// In-memory cache: username → working DNS (expires after 30 min)
const dnsCache = new Map<string, { dns: string; ts: number }>();
const DNS_CACHE_TTL = 30 * 60 * 1000;

function getCachedDns(username: string): string | null {
  const entry = dnsCache.get(username);
  if (entry && Date.now() - entry.ts < DNS_CACHE_TTL) return entry.dns;
  dnsCache.delete(username);
  return null;
}

// ---- DNS Config Admin Routes ----

app.get('/api/app/dns', requireAdmin, async (req, res) => {
  try {
    const list = await getAppDnsList();
    res.json({ dns: list });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/app/dns', requireAdmin, async (req, res) => {
  try {
    const { dns } = req.body; // array of up to 5 URL strings
    if (!Array.isArray(dns)) return res.status(400).json({ error: 'dns deve ser um array' });
    const list = dns.filter((d: any) => typeof d === 'string' && d.trim()).slice(0, 5).map((d: string) => d.trim().replace(/\/$/, '') + '/');
    await pool.query(
      "INSERT INTO settings(key, value, updated_at) VALUES('app_dns_list', $1, NOW()) ON CONFLICT(key) DO UPDATE SET value=$1, updated_at=NOW()",
      [JSON.stringify(list)]
    );
    dnsCache.clear(); // invalidate all cached DNS mappings
    res.json({ success: true, dns: list });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Public endpoint — Android app checks this for config (optional, for future)
app.get('/api/app/config', async (req, res) => {
  const list = await getAppDnsList();
  res.json({ version: 1, servers: list });
});

// App login — autentica cliente pelo painel (customers OU wareztv_customers)
// Suporta device lock: cada conta só pode estar logada em 1 aparelho por vez.
// body: { username, password, device_id?, device_name?, force? }
app.post('/api/app/login', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  if (!rateLimit(`app_login:${ip}`, 10, 60_000)) {
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde 1 minuto.' });
  }

  const username   = String(req.body?.username   || '').trim();
  const password   = String(req.body?.password   || '');
  const deviceId   = String(req.body?.device_id  || '').trim() || null;
  const deviceName = String(req.body?.device_name|| '').trim() || null;
  const force      = req.body?.force === true || req.body?.force === 'true';

  if (!username || !password) {
    return res.status(400).json({ error: 'Informe usuário e senha.' });
  }

  /** Verifica device lock. Retorna null se ok, ou objeto de conflito se bloqueado. */
  function checkDeviceLock(row: any): { locked: true; device_name: string | null } | null {
    if (!deviceId) return null; // app antigo sem device_id: não bloqueia
    if (!row.active_device_id) return null; // sem device registrado: ok
    if (row.active_device_id === deviceId) return null; // mesmo aparelho: ok

    // Sessão expirada (30 dias sem atividade) → libera automaticamente
    if (row.device_locked_at) {
      const age = Date.now() - new Date(row.device_locked_at).getTime();
      if (age > 30 * 24 * 60 * 60 * 1000) return null;
    }

    if (force) return null; // usuário confirmou: força o login
    return { locked: true, device_name: row.active_device_name || null };
  }

  /** Registra o device ativo após login bem-sucedido. */
  async function registerDevice(customerId: number) {
    if (!deviceId) return;
    await pool.query(
      'UPDATE customers SET active_device_id=$1, active_device_name=$2, device_locked_at=NOW() WHERE id=$3',
      [deviceId, deviceName, customerId]
    );
  }

  try {
    // 1. Tenta na tabela principal de clientes
    const custResult = await pool.query(
      `SELECT id, username, password, name, dns, expiration_date, status,
              active_device_id, active_device_name, device_locked_at
       FROM customers WHERE LOWER(username) = LOWER($1)`,
      [username]
    );

    if (custResult.rows[0]) {
      const c = custResult.rows[0];
      if (c.password !== password) return res.status(401).json({ error: 'Usuário ou senha inválidos.' });

      if (c.expiration_date) {
        const exp = new Date(c.expiration_date);
        exp.setHours(23, 59, 59, 999);
        if (exp < new Date()) return res.status(403).json({ error: 'Conta expirada. Contate o suporte.' });
      }

      // ── DEVICE LOCK ──
      const conflict = checkDeviceLock(c);
      if (conflict) {
        return res.status(409).json({
          error: 'Conta em uso em outro aparelho.',
          device_locked: true,
          device_name: conflict.device_name,
        });
      }

      const dnsCandidates: string[] = [];
      if (c.dns?.trim()) dnsCandidates.push(c.dns.trim().replace(/\/$/, '') + '/');
      for (const d of await getAppDnsList()) {
        if (!dnsCandidates.includes(d)) dnsCandidates.push(d);
      }
      if (dnsCandidates.length === 0) return res.status(503).json({ error: 'Nenhum servidor disponível. Contate o suporte.' });

      const authPath = `/player_api.php?username=${encodeURIComponent(c.username)}&password=${encodeURIComponent(c.password)}`;
      let server = dnsCandidates[0];
      for (const dns of dnsCandidates) {
        const r = await fetchFromDns(dns, authPath, 6000);
        if (isDnsResponseValid(r.body, r.status, true)) {
          server = dns;
          dnsCache.set(c.username, { dns, ts: Date.now() });
          break;
        }
      }

      await registerDevice(c.id);
      return res.json({ ok: true, server, username: c.username, password: c.password, name: c.name, expires_at: c.expiration_date });
    }

    // 2. Tenta clientes WarezTV — agora unificados em customers (provider='wareztv')
    const warezResult = await pool.query(
      `SELECT id, username, password, name, expiration_date AS exp_date, status,
              active_device_id, active_device_name, device_locked_at
       FROM customers WHERE LOWER(username) = LOWER($1) AND provider = 'wareztv'`,
      [username]
    );

    if (warezResult.rows[0]) {
      const w = warezResult.rows[0];
      if (w.password !== password) return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
      if (w.status === 'inactive') return res.status(403).json({ error: 'Conta inativa. Contate o suporte.' });

      if (w.exp_date) {
        const exp = new Date(w.exp_date);
        exp.setHours(23, 59, 59, 999);
        if (exp < new Date()) return res.status(403).json({ error: 'Conta expirada. Contate o suporte.' });
      }

      // ── DEVICE LOCK ──
      const conflict = checkDeviceLock(w);
      if (conflict) {
        return res.status(409).json({
          error: 'Conta em uso em outro aparelho.',
          device_locked: true,
          device_name: conflict.device_name,
        });
      }

      const dnsCandidates = await getAppDnsList();
      if (dnsCandidates.length === 0) return res.status(503).json({ error: 'Nenhum servidor disponível. Contate o suporte.' });

      const authPath = `/player_api.php?username=${encodeURIComponent(w.username)}&password=${encodeURIComponent(w.password)}`;
      let server = dnsCandidates[0];
      for (const dns of dnsCandidates) {
        const r = await fetchFromDns(dns, authPath, 6000);
        if (isDnsResponseValid(r.body, r.status, true)) { server = dns; break; }
      }

      await registerDevice(w.id);
      return res.json({ ok: true, server, username: w.username, password: w.password, name: w.name, expires_at: w.exp_date });
    }

    return res.status(401).json({ error: 'Usuário ou senha inválidos.' });

  } catch (e: any) {
    console.error('[app/login]', e.message);
    res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

// App logout — libera o device lock quando o usuário sai voluntariamente
app.post('/api/app/logout', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const deviceId = String(req.body?.device_id || '').trim();
  if (!username || !deviceId) return res.status(400).json({ error: 'username e device_id obrigatórios.' });
  try {
    // Só limpa se for o mesmo device (segurança: não permite limpar device de outro aparelho)
    await pool.query(
      'UPDATE customers SET active_device_id=NULL, active_device_name=NULL, device_locked_at=NULL WHERE LOWER(username)=LOWER($1) AND active_device_id=$2',
      [username, deviceId]
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// ---- Xtream API Relay (/iptv/* e /ip/*) ----
// /ip/ = alias de mesmo tamanho que a URL original do APK (patch direto no DEX, 33 chars)
// /iptv/ = rota principal (usada em versões rebuild com apktool)
// Ambas apontam para o mesmo relay que tenta cada DNS em ordem.

// ---- Xtream API Relay (/iptv/* e /ip/*) ----
// /ip/ é o alias de 33 chars usado no patch direto do DEX do APK original
// /iptv/ é a rota para builds feitos via apktool
// Tries each DNS in order, skipping those that return auth failure or server errors.

/** Returns true if the body/status indicates the DNS actually authenticated the user */
function isDnsResponseValid(body: string, status: number, isPlayerApi: boolean): boolean {
  if (status === 0 || status >= 500) return false;
  if (!body || body.trim() === '') return false;
  // Reject generic denial responses from IPTV servers
  const lower = body.trim().toLowerCase();
  if (lower === 'access denied.' || lower === 'access denied' || lower === 'not found' || lower === '404 not found') return false;
  if (status === 401 || status === 403) return false;
  // For player_api.php: require auth:1 — if auth:0 this user isn't on this provider, try next
  if (isPlayerApi) {
    try {
      const parsed = JSON.parse(body);
      if (parsed?.user_info?.auth === 0 || parsed?.user_info?.auth === '0') return false;
      if (parsed?.user_info?.auth === 1 || parsed?.user_info?.auth === '1') return true;
    } catch {}
    // If body isn't valid JSON player_api response, it's not a valid Xtream server
    return false;
  }
  return true;
}

async function iptvRelayHandler(req: express.Request, res: express.Response, prefix: string) {
  try {
    // Interceptar LOADERAPI_IBO — app chama isso no startup para verificar se está ativo
    if (req.query.GETMOD === 'LOADERAPI_IBO') {
      return res.json({
        status: 1,
        exp_date: '2099-12-31',
        url: `https://atendimento.appbr.pro/${prefix}/`,
        panelurl: `https://atendimento.appbr.pro/${prefix}/`,
        type: 'mag',
        auth: 1
      });
    }

    const dnsList = await getAppDnsList();
    if (dnsList.length === 0) {
      return res.status(503).json({ user_info: { auth: 0 }, message: 'Nenhum servidor configurado' });
    }

    const username = (req.query.username as string) || '';
    const relayPath = req.originalUrl.replace(new RegExp(`^\\/${prefix}`), '') || '/';
    const isPlayerApi = relayPath.includes('player_api.php');

    // Try cached DNS first, then the rest in order
    let orderedDns = [...dnsList];
    const cached = username ? getCachedDns(username) : null;
    if (cached) {
      orderedDns = [cached, ...dnsList.filter(d => d !== cached)];
    }

    let lastBody = '';
    let lastStatus = 503;

    for (const dns of orderedDns) {
      const result = await fetchFromDns(dns, relayPath, 8000);
      lastBody = result.body;
      lastStatus = result.status;

      if (isDnsResponseValid(result.body, result.status, isPlayerApi)) {
        // Cache this working DNS for the user (invalidate old cache if different)
        if (username) {
          if (cached && cached !== dns) dnsCache.delete(username);
          dnsCache.set(username, { dns, ts: Date.now() });
        }
        res.setHeader('Content-Type', isPlayerApi ? 'application/json' : (result.body.startsWith('<') ? 'text/html' : 'application/json'));
        res.setHeader('X-Relay-Dns', dns);
        return res.send(result.body);
      }
      // This DNS failed for this user — continue to next
    }

    // All DNS tried and none authenticated this user
    if (isPlayerApi) {
      return res.status(401).json({ user_info: { auth: 0 }, message: 'Usuário não encontrado em nenhum servidor' });
    }
    // For non-login requests, return last response or 503
    if (lastBody) {
      res.setHeader('X-Relay-Dns', 'fallback');
      return res.send(lastBody);
    }
    res.status(503).json({ user_info: { auth: 0 }, message: 'Servidor temporariamente indisponivel' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

app.use('/iptv', (req, res) => iptvRelayHandler(req, res, 'iptv'));
app.use('/ip', (req, res) => iptvRelayHandler(req, res, 'ip'));

// ---- APK Download ----
app.get('/app/download', (req, res) => {
  const apkPath = path.join(process.cwd(), 'public', 'downloads', 'master-player-pro.apk');
  if (!fs.existsSync(apkPath)) return res.status(404).send('APK não disponível');
  res.download(apkPath, 'MasterPlayerPro.apk');
});

// ============================================================
// WAREZTV (Wplay) — gerenciamento de clientes via API direta
// ============================================================

/** Sincroniza dados de uma WarezLine no banco local (wareztv_customers) E no banco unificado (customers) */
async function upsertWarezCustomer(line: any, extraName?: string) {
  const exp = line.exp_date ? new Date(line.exp_date).toISOString().split('T')[0] : null;
  const warezStatus = line.status === 1 ? (line.is_trial ? 'trial' : 'active') : 'inactive';
  const isTrial = line.is_trial === 1 || line.is_trial === true;
  const planName = line.plan?.name || line.plan_name || (isTrial ? 'Teste 6h' : 'Essencial');
  const maxConns = line.max_connections || 1;
  const name = extraName || line.name || line.notes || null;
  const whatsapp = line.whatsapp || null;

  // 1. Mantém wareztv_customers para compatibilidade
  await pool.query(
    `INSERT INTO wareztv_customers (warez_line_id, username, password, whatsapp, name, notes, exp_date, status, is_trial, plan_name, max_connections, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
     ON CONFLICT (warez_line_id) DO UPDATE SET
       username=EXCLUDED.username, password=EXCLUDED.password, whatsapp=COALESCE(EXCLUDED.whatsapp, wareztv_customers.whatsapp),
       name=COALESCE(EXCLUDED.name, wareztv_customers.name), notes=EXCLUDED.notes,
       exp_date=EXCLUDED.exp_date, status=EXCLUDED.status,
       is_trial=EXCLUDED.is_trial, plan_name=EXCLUDED.plan_name, max_connections=EXCLUDED.max_connections,
       updated_at=NOW()`,
    [line.id, line.username, line.password, whatsapp, name, line.notes || '',
     exp, warezStatus, isTrial, planName, maxConns]
  );

  // 2. UNIFICA no banco geral de clientes (customers)
  // status: active/trial → 'active' | inactive → 'expired'
  const custStatus = warezStatus === 'inactive' ? 'expired' : 'active';
  await pool.query(
    `INSERT INTO customers
       (username, password, name, whatsapp, expiration_date, status, provider,
        warez_line_id, is_trial, plan_name, max_connections, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'wareztv',$7,$8,$9,$10,NOW(),NOW())
     ON CONFLICT (username) DO UPDATE SET
       password        = EXCLUDED.password,
       name            = COALESCE(EXCLUDED.name, customers.name),
       whatsapp        = COALESCE(EXCLUDED.whatsapp, customers.whatsapp),
       expiration_date = EXCLUDED.expiration_date,
       status          = EXCLUDED.status,
       provider        = 'wareztv',
       warez_line_id   = EXCLUDED.warez_line_id,
       is_trial        = EXCLUDED.is_trial,
       plan_name       = EXCLUDED.plan_name,
       max_connections = EXCLUDED.max_connections,
       updated_at      = NOW()`,
    [line.username, line.password, name, whatsapp, exp, custStatus,
     line.id, isTrial, planName, maxConns]
  );
}

// Reseller info
app.get('/api/wareztv/reseller', requireAdmin, async (req, res) => {
  try {
    const data = await warezApi.getReseller();
    res.json(data);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// List clients (paginated, with sync)
app.get('/api/wareztv/clients', requireAdmin, async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const perPage = Number(req.query.perPage || 100);
    const isTrial = req.query.trial === '1';
    const data = isTrial ? await warezApi.listTests(page, perPage) : await warezApi.listClients(page, perPage);
    // Sync to local DB in background
    if (data.items?.length) {
      Promise.all(data.items.map((line) => upsertWarezCustomer(line))).catch(e => console.error('[WarezSync]', e.message));
    }
    res.json(data);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Generate test (6 hours)
app.post('/api/wareztv/test', requireAdmin, async (req, res) => {
  try {
    const { notes, whatsapp, name } = req.body;
    const line = await warezApi.generateTest(notes || name || '');
    // extraName passa nome/whatsapp para upsertWarezCustomer gravar em ambas as tabelas
    const lineWithMeta = { ...line, is_trial: 1, whatsapp: whatsapp || line.whatsapp, name: name || null };
    await upsertWarezCustomer(lineWithMeta, name || null);
    res.json({ success: true, username: line.username, password: line.password, exp_date: line.exp_date, line_id: line.id });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Create paid client
app.post('/api/wareztv/clients', requireAdmin, async (req, res) => {
  try {
    const { whatsapp, name, country, planId, days, notes } = req.body;
    const line = await warezApi.createClient({ whatsapp, country, planId, days, notes: notes || name || '' });
    const lineWithMeta = { ...line, whatsapp: whatsapp || line.whatsapp, name: name || null };
    await upsertWarezCustomer(lineWithMeta, name || null);
    res.json({ success: true, username: line.username, password: line.password, exp_date: line.exp_date, line_id: line.id });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Extend client
app.post('/api/wareztv/clients/:lineId/extend', requireAdmin, async (req, res) => {
  try {
    const lineId = Number(req.params.lineId);
    const credits = Number(req.body.credits || 1);
    const line = await warezApi.extendClient(lineId, credits);
    await upsertWarezCustomer(line);
    res.json({ success: true, exp_date: line.exp_date });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Reset password
app.post('/api/wareztv/clients/:lineId/reset-password', requireAdmin, async (req, res) => {
  try {
    const lineId = Number(req.params.lineId);
    const line = await warezApi.resetPassword(lineId);
    await upsertWarezCustomer(line);
    res.json({ success: true, password: line.password });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// MÚLTIPLOS NÚMEROS POR CLIENTE — CRUD
// ============================================================

// Listar números vinculados
app.get('/api/admin/customers/:id/phones', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, phone, label, created_at FROM customer_phones WHERE customer_id=$1 ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Adicionar número vinculado
app.post('/api/admin/customers/:id/phones', requireAdmin, async (req, res) => {
  try {
    const { phone, label } = req.body;
    if (!phone) return res.status(400).json({ error: 'Número obrigatório' });
    // Verifica se já está vinculado a outro cliente
    const norm = phone.replace(/\D/g, '');
    const conflict = await pool.query(
      `SELECT cp.id, c.name FROM customer_phones cp JOIN customers c ON c.id=cp.customer_id
       WHERE regexp_replace(cp.phone,'\\D','','g')=$1 AND cp.customer_id!=$2`,
      [norm, req.params.id]
    );
    if (conflict.rows[0]) {
      return res.status(409).json({ error: `Número já vinculado ao cliente "${conflict.rows[0].name}"` });
    }
    const { rows } = await pool.query(
      `INSERT INTO customer_phones (customer_id, phone, label) VALUES ($1,$2,$3)
       ON CONFLICT DO NOTHING RETURNING *`,
      [req.params.id, norm, label || null]
    );
    res.json(rows[0] || { error: 'Número já cadastrado' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Remover número vinculado
app.delete('/api/admin/customers/:id/phones/:phoneId', requireAdmin, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM customer_phones WHERE id=$1 AND customer_id=$2`,
      [req.params.phoneId, req.params.id]
    );
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Migrar cliente Start → WarezTV
// Cria uma linha WarezTV e vincula ao cliente existente no banco unificado
app.post('/api/admin/customers/:id/migrate-to-wareztv', requireAdmin, async (req, res) => {
  try {
    const customerId = Number(req.params.id);
    const { days = 30, planId, whatsapp, name } = req.body;

    // Busca cliente atual
    const custRes = await pool.query('SELECT * FROM customers WHERE id=$1', [customerId]);
    if (!custRes.rows[0]) return res.status(404).json({ error: 'Cliente não encontrado' });
    const customer = custRes.rows[0];

    if (customer.provider === 'wareztv' && customer.warez_line_id) {
      return res.status(400).json({ error: 'Cliente já é WarezTV (warez_line_id: ' + customer.warez_line_id + ')' });
    }

    // Cria linha na WarezTV
    const line = await warezApi.createClient({
      whatsapp: whatsapp || customer.whatsapp || '',
      notes: name || customer.name || customer.username,
      days: Number(days),
      ...(planId ? { planId: Number(planId) } : {}),
    });

    const exp = line.exp_date ? new Date(line.exp_date).toISOString().split('T')[0] : null;

    // Atualiza o cliente no banco unificado
    await pool.query(
      `UPDATE customers SET
         provider        = 'wareztv',
         warez_line_id   = $1,
         username        = $2,
         password        = $3,
         expiration_date = $4,
         status          = 'active',
         is_trial        = false,
         plan_name       = $5,
         max_connections = $6,
         updated_at      = NOW()
       WHERE id = $7`,
      [line.id, line.username, line.password, exp,
       line.plan?.name || 'Essencial', line.max_connections || 2, customerId]
    );

    // Garante que também existe em wareztv_customers
    await upsertWarezCustomer(
      { ...line, name: name || customer.name, whatsapp: whatsapp || customer.whatsapp },
      name || customer.name
    );

    console.log(`[MigraçãoWarez] Cliente id=${customerId} migrado → WarezTV linha ${line.id} (${line.username})`);

    res.json({
      success: true,
      warez_username: line.username,
      warez_password: line.password,
      warez_line_id: line.id,
      exp_date: line.exp_date,
      plan: line.plan?.name || 'Essencial',
    });
  } catch (e: any) {
    console.error('[MigraçãoWarez] Erro:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Delete client
app.delete('/api/wareztv/clients/:lineId', requireAdmin, async (req, res) => {
  try {
    const lineId = Number(req.params.lineId);
    await warezApi.deleteClient(lineId);
    // Remove de ambas as tabelas
    await pool.query(`DELETE FROM wareztv_customers WHERE warez_line_id=$1`, [lineId]);
    await pool.query(`DELETE FROM customers WHERE warez_line_id=$1`, [lineId]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Update local metadata (name, notes, whatsapp)
app.patch('/api/wareztv/clients/:lineId', requireAdmin, async (req, res) => {
  try {
    const lineId = Number(req.params.lineId);
    const { name, notes, whatsapp } = req.body;
    // Atualiza wareztv_customers
    await pool.query(
      `UPDATE wareztv_customers SET name=COALESCE($1,name), notes=COALESCE($2,notes), whatsapp=COALESCE($3,whatsapp), updated_at=NOW() WHERE warez_line_id=$4`,
      [name || null, notes || null, whatsapp || null, lineId]
    );
    // Atualiza customers (banco unificado)
    await pool.query(
      `UPDATE customers SET name=COALESCE($1,name), whatsapp=COALESCE($2,whatsapp), updated_at=NOW() WHERE warez_line_id=$3`,
      [name || null, whatsapp || null, lineId]
    );
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Get products/plans
app.get('/api/wareztv/products', requireAdmin, async (req, res) => {
  try {
    const data = await warezApi.getProducts();
    res.json(data);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// AUTO-REGISTRO DO WEBHOOK DA EVOLUTION API NO STARTUP
// Garante que mesmo após deploy/restart os webhooks cheguem.
// ============================================================
async function autoRegisterEvolutionWebhook() {
  try {
    await new Promise(r => setTimeout(r, 3000)); // aguarda DB estabilizar
    const settings = await pool.query("SELECT key, value FROM settings WHERE key LIKE 'evolution_%'");
    const cfg: any = {};
    settings.rows.forEach((r: any) => cfg[r.key] = r.value);

    if (!cfg.evolution_api_url || !cfg.evolution_token || !cfg.evolution_instance) {
      console.log('[Webhook] Evolution API não configurada no DB — webhook auto-registro pulado.');
      return;
    }

    const webhookUrl = `https://atendimento.appbr.pro/api/webhooks/evolution`;

    // Evolution API v2 — payload encapsulado em "webhook" (formato correto da v2)
    const res = await fetch(`${cfg.evolution_api_url}/webhook/set/${cfg.evolution_instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': cfg.evolution_token },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: false,
          events: [
            'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_DELETE',
            'CONNECTION_UPDATE', 'QRCODE_UPDATED', 'SEND_MESSAGE',
            'CONTACTS_UPSERT', 'CONTACTS_UPDATE',
            'CHATS_UPSERT', 'CHATS_UPDATE', 'CHATS_DELETE',
          ],
        },
      }),
    });

    if (res.ok) {
      console.log(`[Webhook] ✅ Webhook Evolution registrado com sucesso → ${webhookUrl}`);
    } else {
      const err = await res.text();
      console.warn(`[Webhook] ⚠️ Falha ao registrar webhook Evolution (${res.status}): ${err.slice(0, 200)}`);
    }

    // Também verifica status da instância
    const statusRes = await fetch(`${cfg.evolution_api_url}/instance/connectionState/${cfg.evolution_instance}`, {
      headers: { 'apikey': cfg.evolution_token },
    });
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      console.log(`[Webhook] Estado da instância Evolution: ${JSON.stringify(statusData)}`);
    }
  } catch (e: any) {
    console.warn('[Webhook] Erro no auto-registro do webhook Evolution:', e.message);
  }
}

// Endpoint admin para forçar re-registro manualmente
app.post('/api/admin/evolution/setup-webhook', requireAdmin, async (req, res) => {
  try {
    const settings = await pool.query("SELECT key, value FROM settings WHERE key LIKE 'evolution_%'");
    const cfg: any = {};
    settings.rows.forEach((r: any) => cfg[r.key] = r.value);

    if (!cfg.evolution_api_url || !cfg.evolution_token || !cfg.evolution_instance) {
      return res.status(400).json({ error: 'Evolution API não configurada' });
    }

    const webhookUrl = `https://atendimento.appbr.pro/api/webhooks/evolution`;

    const wRes = await fetch(`${cfg.evolution_api_url}/webhook/set/${cfg.evolution_instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': cfg.evolution_token },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: false,
          events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_DELETE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED', 'SEND_MESSAGE', 'CONTACTS_UPSERT', 'CONTACTS_UPDATE', 'CHATS_UPSERT', 'CHATS_UPDATE', 'CHATS_DELETE'],
        },
      }),
    });

    const statusRes = await fetch(`${cfg.evolution_api_url}/instance/connectionState/${cfg.evolution_instance}`, {
      headers: { 'apikey': cfg.evolution_token },
    });
    const statusData = statusRes.ok ? await statusRes.json() : null;

    res.json({
      webhook: { ok: wRes.ok, status: wRes.status, body: await wRes.text() },
      connection: statusData,
      webhookUrl,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// MIGRAÇÃO ONE-TIME: copia wareztv_customers → customers
// Idempotente (ON CONFLICT DO UPDATE) — seguro rodar sempre
// ============================================================
async function migrateWarezCustomersToUnified() {
  try {
    const { rows } = await pool.query(`SELECT * FROM wareztv_customers`);
    if (rows.length === 0) return;
    let migrated = 0;
    for (const w of rows) {
      const custStatus = w.status === 'inactive' ? 'expired' : 'active';
      await pool.query(
        `INSERT INTO customers
           (username, password, name, whatsapp, expiration_date, status, provider,
            warez_line_id, is_trial, plan_name, max_connections, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,'wareztv',$7,$8,$9,$10,COALESCE($11,NOW()),NOW())
         ON CONFLICT (username) DO UPDATE SET
           password        = EXCLUDED.password,
           name            = COALESCE(EXCLUDED.name, customers.name),
           whatsapp        = COALESCE(EXCLUDED.whatsapp, customers.whatsapp),
           expiration_date = EXCLUDED.expiration_date,
           status          = EXCLUDED.status,
           provider        = 'wareztv',
           warez_line_id   = EXCLUDED.warez_line_id,
           is_trial        = EXCLUDED.is_trial,
           plan_name       = EXCLUDED.plan_name,
           max_connections = EXCLUDED.max_connections,
           updated_at      = NOW()`,
        [w.username, w.password, w.name || null, w.whatsapp || null,
         w.exp_date || null, custStatus, w.warez_line_id,
         w.is_trial || false, w.plan_name || null, w.max_connections || 1,
         w.created_at || null]
      );
      migrated++;
    }
    console.log(`[MigraçãoWarezTV] ✅ ${migrated} cliente(s) migrado(s) para o banco unificado.`);
  } catch (e: any) {
    console.warn('[MigraçãoWarezTV] Erro na migração:', e.message);
  }
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
  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
    // Inicia verificador de pagamentos do app (a cada 5 minutos)
    checkAppPayments();
    setInterval(checkAppPayments, 1000 * 60 * 5);
    // Registra webhook da Evolution API automaticamente
    autoRegisterEvolutionWebhook();
    // Migra clientes WarezTV existentes para o banco unificado (customers)
    migrateWarezCustomersToUnified();
  });
}
startServer();
