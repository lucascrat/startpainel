/**
 * Worker de automacoes — roda no PC local com Chrome VISIVEL.
 *
 * Como funciona:
 *   1. Mantém pool de 5 perfis Chrome independentes (PuppeteerProfile-1 … 5)
 *   2. Faz polling no servidor a cada ~5s buscando jobs pendentes
 *   3. Quando tem slot livre, claim atômico + executa Puppeteer em paralelo
 *   4. Devolve o resultado pro servidor e libera o slot
 *
 * Por que separado do server.ts:
 *   - Producao (Coolify) nao precisa rodar Chromium (economia de RAM/CPU)
 *   - Voce ve as automacoes acontecendo no seu Chrome (debug e resolucao manual de captcha)
 *   - Cookies/sessao do StartPainel persistem entre runs (mesmo perfil)
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
  activateQuickPlay,
  createTestClientAndActivatePlayer,
  setCustomExpirationPuppeteer,
  deleteExpiredTrials,
  syncAllPanelClients,
} from './src/services/startpainel-puppeteer.js';
import { runIBOSupportAutomation, runIBORepairAutomation } from './src/services/ibo-support-service.js';
import { runBobPlayerRepair } from './src/services/bobplayer-service.js';
import { runClouddyUpdatePlaylist } from './src/services/clouddy-service.js';
import { runIBOProAutomation } from './src/services/ibo-pro-support.js';
import { runSmartOneSetup, initSmartOneSession } from './src/services/smartone-service.js';
import { runVUProSetup } from './src/services/vupro-service.js';
import { runAtiveAppActivation } from './src/services/ativeapp-service.js';

const SERVER_URL = (process.env.WORKER_SERVER_URL || 'https://atendimento.appbr.pro').replace(/\/$/, '');
const WORKER_TOKEN = process.env.WORKER_TOKEN;
const WORKER_ID = process.env.WORKER_ID || `${os.hostname()}-${process.pid}`;
const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS || 5000);
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 5);
const VERSION = '1.2.0'; // ativeapp_activate + INICIAR-WORKER.bat

if (!WORKER_TOKEN) {
  console.error('❌ WORKER_TOKEN ausente no .env. Configure e tente de novo.');
  process.exit(1);
}

console.log(`🤖 Worker iniciando`);
console.log(`   server:      ${SERVER_URL}`);
console.log(`   workerId:    ${WORKER_ID}`);
console.log(`   poll:        ${POLL_INTERVAL_MS}ms`);
console.log(`   concurrency: ${CONCURRENCY} perfis paralelos`);
console.log(`   version:     ${VERSION}`);

// ─── Pool de perfis ───────────────────────────────────────────────────────────
// Slots numerados de 1 a CONCURRENCY. freeProfiles guarda os que estão livres.
const freeProfiles = new Set<number>(Array.from({ length: CONCURRENCY }, (_, i) => i + 1));

function acquireProfile(): number | null {
  const [first] = freeProfiles;
  if (first === undefined) return null;
  freeProfiles.delete(first);
  return first;
}

function releaseProfile(n: number) {
  freeProfiles.add(n);
  console.log(`   [pool] Perfil-${n} liberado. Livres: [${[...freeProfiles].sort().join(', ')}]`);
}

// ─── Handlers ────────────────────────────────────────────────────────────────
type JobHandler = (payload: any, profileNum: number) => Promise<any>;

const handlers: Record<string, JobHandler> = {
  renew_client:          ({ username }, p) => renewClientPuppeteer(username, p),
  set_custom_expiration: ({ username, newDate }, p) => setCustomExpirationPuppeteer(username, newDate, p),
  ativeapp_activate:    ({ appName, mac }, p) => runAtiveAppActivation(appName, mac, p),
  bob_repair:           ({ mac, key, playlistUrl }, p) => runBobPlayerRepair(mac, key, playlistUrl, p),
  clouddy_repair:       ({ email, senha, playlistUrl }, p) => runClouddyUpdatePlaylist(email, senha, playlistUrl, p),
  create_client:     ({ username }, p) => createClientAndGetPlaylist(username, p),
  mac_support:       ({ mac, key, playlistUrl }, p) => runIBOSupportAutomation(mac, key, playlistUrl, p),
  activate_ultra:    ({ username, mac }, p) => activateUltraPlayer(username, mac, p),
  activate_funplay:  ({ username, mac }, p) => activateFunPlay(username, mac, p),
  activate_lazerplay:({ username, mac }, p) => activateLazerPlay(username, mac, p),
  activate_xcloud:   ({ username, mac }, p) => activateXCloud(username, mac, p),
  activate_seeplay:  ({ username, mac }, p) => activateSeePlay(username, mac, p),
  activate_quickplay:({ username, mac }, p) => activateQuickPlay(username, mac, p),
  delete_expired_trials: ({ clientType, period }, p) => deleteExpiredTrials({ clientType, period }, p),
  sync_panel_clients:    ({ maxClients }, p) => syncAllPanelClients(p, maxClients || 200),
  create_test:       async (payload, p) => {
    const { username, mac, playerName, deviceKey, password } = payload;
    const result = await createTestClientAndActivatePlayer(username || '', mac, playerName, p);
    
    const isSmartOne = playerName && (playerName.toLowerCase().includes('smartone') || playerName.toLowerCase().includes('smart-one') || playerName.toLowerCase().includes('smart one'));
    if (isSmartOne && result.success && result.playlistUrl) {
      console.log('[Worker] Configurando SmartOne para o novo teste...');
      const listName = result.username ? `${result.username} - SmartOne` : 'Cliente - SmartOne';
      const smartoneRes = await runSmartOneSetup(mac, listName, result.playlistUrl, p);
      if (!smartoneRes.success) {
        return {
          ...result,
          success: false,
          message: `Teste criado no painel (${result.username}), mas falhou ao configurar no SmartOne: ${smartoneRes.message}`
        };
      }
      return {
        ...result,
        message: `Cliente teste "${result.username}" criado e SmartOne configurado com sucesso!`
      };
    }

    const isVUPro = playerName && (playerName.toLowerCase().includes('vu') || playerName.toLowerCase().includes('vupro') || playerName.toLowerCase().includes('vu player'));
    if (isVUPro && result.success && result.playlistUrl) {
      console.log('[Worker] Configurando VU Player Pro para o novo teste...');
      const listName = result.username || 'Teste';
      const key = deviceKey || password || '687840';
      const vuproRes = await runVUProSetup(mac, key, result.playlistUrl, listName, p);
      if (!vuproRes.success) {
        return {
          ...result,
          success: false,
          message: `Teste criado no painel (${result.username}), mas falhou ao configurar no VU Player Pro: ${vuproRes.message}`
        };
      }
      return {
        ...result,
        message: `Cliente teste "${result.username}" criado e VU Player Pro configurado com sucesso!`
      };
    }

    return result;
  },
  ibo_setup:         ({ mac, key, playlistUrl }, p) => runIBOSupportAutomation(mac, key, playlistUrl, p),
  ibo_repair:        ({ mac, key, playlistUrl }, p) => runIBORepairAutomation(mac, key, playlistUrl, p),
  ibo_pro_setup:     ({ mac, key, playlistUrl }, p) => runIBOProAutomation(mac, key, playlistUrl, p),
  smartone_setup:    ({ mac, listName, playlistUrl }, p) => runSmartOneSetup(mac, listName, playlistUrl, p),
  smartone_init:     (_payload: any, _p: number) => initSmartOneSession(),
  vupro_setup:       ({ mac, deviceKey, playlistUrl, listName }, p) => runVUProSetup(mac, deviceKey || '687840', playlistUrl, listName || 'Teste', p),
};

// ─── API helpers ─────────────────────────────────────────────────────────────
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

// ─── Execução de job (fire-and-forget) ───────────────────────────────────────
async function runJob(job: any, profileNum: number): Promise<void> {
  const start = Date.now();
  console.log(`\n📥 Job #${job.id} type=${job.type} [perfil-${profileNum}] attempts=${job.attempts}`);
  console.log(`   payload:`, JSON.stringify(job.payload).slice(0, 200));

  const handler = handlers[job.type];
  if (!handler) {
    const msg = `Tipo de job desconhecido: ${job.type}`;
    console.error(`   ❌ ${msg}`);
    await complete(job.id, false, null, msg);
    releaseProfile(profileNum);
    return;
  }

  try {
    const result = await handler(job.payload, profileNum);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const ok = result?.success !== false;
    console.log(`   ${ok ? '✅' : '❌'} Job #${job.id} [perfil-${profileNum}] em ${elapsed}s — ${result?.message || ''}`);
    await complete(job.id, ok, result, ok ? null : (result?.message || 'Falhou'));
  } catch (e: any) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const msg = e?.message || String(e);
    console.error(`   ❌ Job #${job.id} [perfil-${profileNum}] EXCEÇÃO em ${elapsed}s: ${msg}`);
    await complete(job.id, false, null, msg);
  } finally {
    releaseProfile(profileNum);
  }
}

// ─── Poll: tenta pegar 1 job do servidor ─────────────────────────────────────
async function pollJob(): Promise<any | null> {
  try {
    const r = await api('/api/worker/poll', {
      workerId: WORKER_ID,
      hostname: os.hostname(),
      version: VERSION,
    });
    if (!r.ok) {
      const txt = await r.text();
      console.error(`[Worker] poll falhou: ${r.status} ${txt.slice(0, 200)}`);
      return null;
    }
    return await r.json(); // null quando fila vazia
  } catch (e: any) {
    console.error(`[Worker] poll erro de rede: ${e?.message}`);
    return null;
  }
}

// ─── Loop principal ───────────────────────────────────────────────────────────
// - Se há slots livres: tenta pegar um job e dispara em paralelo (sem await).
// - Se todos os 5 slots estão ocupados: aguarda 1s e tenta de novo.
// - Se não há jobs na fila: aguarda POLL_INTERVAL_MS antes do próximo poll.
let running = true;

async function loop() {
  while (running) {
    const profileNum = acquireProfile();

    if (profileNum === null) {
      // Todos os perfis ocupados — aguarda liberar
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    const job = await pollJob();

    if (!job) {
      // Sem jobs na fila — devolve o slot e aguarda
      releaseProfile(profileNum);
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }

    // Dispara o job em background — não bloqueia o loop
    runJob(job, profileNum); // sem await intencional

    // Drena a fila: tenta imediatamente outro poll (sem delay)
  }
}

// ─── Inicialização ────────────────────────────────────────────────────────────
(async () => {
  try {
    const r = await api('/api/worker/heartbeat', { workerId: WORKER_ID, hostname: os.hostname(), version: VERSION });
    if (!r.ok) {
      const txt = await r.text();
      console.error(`❌ Heartbeat inicial falhou: ${r.status} ${txt}`);
      console.error(`   Verifique se WORKER_TOKEN e WORKER_SERVER_URL estão corretos.`);
      process.exit(1);
    }
    console.log(`✅ Conectado ao servidor. Iniciando loop com ${CONCURRENCY} perfis paralelos.\n`);
    loop();
  } catch (e: any) {
    console.error(`❌ Nao foi possivel conectar ao servidor: ${e?.message}`);
    console.error(`   URL: ${SERVER_URL}`);
    process.exit(1);
  }
})();

process.on('SIGINT', () => { running = false; console.log('\n👋 Worker encerrando...'); setTimeout(() => process.exit(0), 500); });
process.on('SIGTERM', () => { running = false; console.log('\n👋 Worker encerrando...'); setTimeout(() => process.exit(0), 500); });
