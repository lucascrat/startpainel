/**
 * Worker de automacoes — roda no PC local com Chrome VISIVEL.
 *
 * Como funciona:
 *   1. Faz polling no servidor (atendimento.appbr.pro) a cada ~5s
 *   2. Quando tem job pendente, claim atomico e executa Puppeteer aqui
 *   3. Devolve o resultado pro servidor
 *
 * Por que separado do server.ts:
 *   - Producao (Coolify) nao precisa rodar Chromium (economia de RAM/CPU)
 *   - Voce ve as automacoes acontecendo no seu Chrome (debug e resolucao manual de captcha)
 *   - Cookies/sessao do StartPainel persistem entre runs (mesmo perfil)
 *
 * Como rodar:
 *   1. Configure as envs no .env local (WORKER_SERVER_URL, WORKER_TOKEN)
 *   2. npm run worker
 *   3. Mantenha o PC ligado — se cair, automacoes ficam pendentes ate timeout (5min)
 */
import dotenv from 'dotenv';
dotenv.config();
import os from 'os';
import {
  renewClientPuppeteer,
  createClientAndGetPlaylist,
  activateUltraPlayer,
  activateFunPlay,
  activateLazerPlay,
  activateXCloud,
  activateSeePlay,
  createTestClientAndActivatePlayer,
} from './src/services/startpainel-puppeteer.js';
import { runIboPlayerAutomation } from './src/services/ibo-automation.js';

const SERVER_URL = (process.env.WORKER_SERVER_URL || 'https://atendimento.appbr.pro').replace(/\/$/, '');
const WORKER_TOKEN = process.env.WORKER_TOKEN;
const WORKER_ID = process.env.WORKER_ID || `${os.hostname()}-${process.pid}`;
const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS || 5000);
const VERSION = '1.0.0';

if (!WORKER_TOKEN) {
  console.error('❌ WORKER_TOKEN ausente no .env. Configure e tente de novo.');
  console.error('   Gere um token aleatorio com:');
  console.error('     node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  console.error('   Cole o mesmo valor no .env local E no Coolify (env do app de producao).');
  process.exit(1);
}

console.log(`🤖 Worker iniciando`);
console.log(`   server:   ${SERVER_URL}`);
console.log(`   workerId: ${WORKER_ID}`);
console.log(`   poll:     ${POLL_INTERVAL_MS}ms`);
console.log(`   version:  ${VERSION}`);

type JobHandler = (payload: any) => Promise<any>;
const handlers: Record<string, JobHandler> = {
  renew_client: ({ username }) => renewClientPuppeteer(username),
  create_client: ({ username }) => createClientAndGetPlaylist(username),
  activate_ultra: ({ username, mac }) => activateUltraPlayer(username, mac),
  activate_funplay: ({ username, mac }) => activateFunPlay(username, mac),
  activate_lazerplay: ({ username, mac }) => activateLazerPlay(username, mac),
  activate_xcloud: ({ username, mac }) => activateXCloud(username, mac),
  activate_seeplay: ({ username, mac }) => activateSeePlay(username, mac),
  create_test: ({ username, mac, playerName }) =>
    createTestClientAndActivatePlayer(username || '', mac, playerName),
  ibo_setup: ({ mac, key, playlistUrl, targetUrl }) =>
    runIboPlayerAutomation(mac, key, playlistUrl, process.env.GEMINI_API_KEY, targetUrl),
};

async function api(path: string, body: any): Promise<Response> {
  return fetch(`${SERVER_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Worker-Token': WORKER_TOKEN!,
    },
    body: JSON.stringify(body),
  });
}

async function complete(id: number, ok: boolean, result: any, error: string | null) {
  try {
    const r = await api(`/api/worker/jobs/${id}/complete`, { ok, result, error });
    if (!r.ok) console.error(`[Worker] complete falhou: ${r.status} ${await r.text()}`);
  } catch (e: any) {
    console.error(`[Worker] complete erro: ${e?.message}`);
  }
}

async function pollOnce(): Promise<boolean> {
  try {
    const r = await api('/api/worker/poll', {
      workerId: WORKER_ID,
      hostname: os.hostname(),
      version: VERSION,
    });
    if (!r.ok) {
      const txt = await r.text();
      console.error(`[Worker] poll falhou: ${r.status} ${txt.slice(0, 200)}`);
      return false;
    }
    const job = await r.json();
    if (!job) return false; // nenhum job pendente

    const start = Date.now();
    console.log(`\n📥 Job #${job.id} type=${job.type} attempts=${job.attempts}`);
    console.log(`   payload:`, JSON.stringify(job.payload).slice(0, 200));

    const handler = handlers[job.type];
    if (!handler) {
      const msg = `Tipo de job desconhecido: ${job.type}`;
      console.error(`   ❌ ${msg}`);
      await complete(job.id, false, null, msg);
      return true;
    }

    try {
      const result = await handler(job.payload);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      // Convencao: handlers retornam { success: bool, message?: string, ...campos }
      const ok = result?.success !== false;
      console.log(`   ${ok ? '✅' : '❌'} Job #${job.id} em ${elapsed}s — ${result?.message || ''}`);
      await complete(job.id, ok, result, ok ? null : (result?.message || 'Falhou'));
    } catch (e: any) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const msg = e?.message || String(e);
      console.error(`   ❌ Job #${job.id} EXCECAO em ${elapsed}s: ${msg}`);
      await complete(job.id, false, null, msg);
    }
    return true;
  } catch (e: any) {
    console.error(`[Worker] poll erro de rede: ${e?.message}`);
    return false;
  }
}

// Loop principal — drena fila enquanto houver jobs, depois aguarda POLL_INTERVAL_MS.
let consecutiveErrors = 0;
async function loop() {
  while (true) {
    const gotJob = await pollOnce();
    if (gotJob) {
      consecutiveErrors = 0;
      // Drena fila: se pegou um job, tenta pegar outro sem esperar.
      continue;
    }
    // Sem jobs ou erro — espera antes do proximo poll.
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
}

// Heartbeat inicial pra confirmar conectividade antes de entrar no loop.
(async () => {
  try {
    const r = await api('/api/worker/heartbeat', { workerId: WORKER_ID, hostname: os.hostname(), version: VERSION });
    if (!r.ok) {
      const txt = await r.text();
      console.error(`❌ Heartbeat inicial falhou: ${r.status} ${txt}`);
      console.error(`   Verifique se:`);
      console.error(`     - WORKER_TOKEN no .env é o mesmo configurado no Coolify`);
      console.error(`     - WORKER_SERVER_URL aponta pro server certo (${SERVER_URL})`);
      console.error(`     - O server esta no ar`);
      process.exit(1);
    }
    console.log(`✅ Conectado ao servidor. Iniciando loop de polling.\n`);
    loop();
  } catch (e: any) {
    console.error(`❌ Nao foi possivel conectar ao servidor: ${e?.message}`);
    console.error(`   URL: ${SERVER_URL}`);
    process.exit(1);
  }
})();

// Trata Ctrl+C / SIGTERM com saida limpa.
process.on('SIGINT', () => { console.log('\n👋 Worker encerrando...'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n👋 Worker encerrando...'); process.exit(0); });
