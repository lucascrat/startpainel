import { pool } from '../../db/index.js';
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
} from './startpainel-puppeteer.js';
import { runIBOSupportAutomation, runIBORepairAutomation } from './ibo-support-service.js';
import { runBobPlayerRepair } from './bobplayer-service.js';
import { runClouddyUpdatePlaylist } from './clouddy-service.js';
import { runIBOProAutomation } from './ibo-pro-support.js';
import { runSmartOneSetup, initSmartOneSession } from './smartone-service.js';
import { runVUProSetup } from './vupro-service.js';
import { runAtiveAppActivation } from './ativeapp-service.js';

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 5);
const freeProfiles = new Set<number>(Array.from({ length: CONCURRENCY }, (_, i) => i + 1));

function acquireProfile(): number | null {
  const [first] = freeProfiles;
  if (first === undefined) return null;
  freeProfiles.delete(first);
  return first;
}

function releaseProfile(n: number) {
  freeProfiles.add(n);
  console.log(`   [InternalWorker] Perfil-${n} liberado. Livres: [${[...freeProfiles].sort().join(', ')}]`);
}

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
      console.log('[InternalWorker] Configurando SmartOne para o novo teste...');
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
      console.log('[InternalWorker] Configurando VU Player Pro para o novo teste...');
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

async function completeJob(id: number, ok: boolean, result: any, error: string | null) {
  try {
    await pool.query(
      `UPDATE automation_jobs 
       SET status = $1, result = $2::jsonb, error = $3, completed_at = NOW() 
       WHERE id = $4`,
      [ok ? 'completed' : 'failed', JSON.stringify(result || {}), error, id]
    );
  } catch (e: any) {
    console.error(`[InternalWorker] Erro ao concluir job ${id}:`, e.message);
  }
}

async function runJob(job: any, profileNum: number): Promise<void> {
  const start = Date.now();
  console.log(`\n[InternalWorker] 📥 Job #${job.id} type=${job.type} [perfil-${profileNum}]`);
  
  const handler = handlers[job.type];
  if (!handler) {
    const msg = `Tipo de job desconhecido: ${job.type}`;
    console.error(`   ❌ ${msg}`);
    await completeJob(job.id, false, null, msg);
    releaseProfile(profileNum);
    return;
  }

  try {
    const result = await handler(job.payload, profileNum);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const ok = result?.success !== false;
    console.log(`   ${ok ? '✅' : '❌'} Job #${job.id} [perfil-${profileNum}] em ${elapsed}s — ${result?.message || ''}`);
    await completeJob(job.id, ok, result, ok ? null : (result?.message || 'Falhou'));
  } catch (e: any) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const msg = e?.message || String(e);
    console.error(`   ❌ Job #${job.id} [perfil-${profileNum}] EXCEÇÃO em ${elapsed}s: ${msg}`);
    await completeJob(job.id, false, null, msg);
  } finally {
    releaseProfile(profileNum);
  }
}

async function pollJobs() {
  try {
    // Busca 1 job pendente e bloqueia (SKIP LOCKED) para concorrência
    const res = await pool.query(`
      UPDATE automation_jobs 
      SET status = 'processing', attempts = attempts + 1, updated_at = NOW()
      WHERE id = (
        SELECT id FROM automation_jobs 
        WHERE status IN ('pending') 
           OR (status = 'processing' AND updated_at < NOW() - INTERVAL '5 minutes')
        ORDER BY created_at ASC 
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *
    `);
    
    return res.rows[0] || null;
  } catch (e: any) {
    console.error(`[InternalWorker] Erro no poll:`, e.message);
    return null;
  }
}

let running = false;
export function startInternalWorker() {
  if (running) return;
  running = true;
  console.log(`[InternalWorker] Iniciando background worker com ${CONCURRENCY} perfis paralelos.`);
  
  async function loop() {
    while (running) {
      const profileNum = acquireProfile();
      if (profileNum === null) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      const job = await pollJobs();
      if (!job) {
        releaseProfile(profileNum);
        await new Promise(r => setTimeout(r, 3000)); // Poll a cada 3s se vazio
        continue;
      }

      runJob(job, profileNum);
    }
  }
  
  loop();
}
