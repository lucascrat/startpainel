/**
 * Import em lote de clientes do painel cms.startpainel.cc para o nosso DB.
 *
 * Como funciona:
 *   1. Abre 1 Chrome (perfil PuppeteerProfile — separado dos 5 do worker)
 *   2. Login uma vez no painel
 *   3. Para cada username da lista USERNAMES:
 *      - busca, lê status/data/telas da row
 *      - clica Visualizar, extrai senha + M3U
 *      - UPSERT em customers (cria se novo, atualiza se já existe)
 *   4. Imprime resumo no final
 *
 * Como rodar:
 *   - "Importar Clientes 2026.bat" no desktop, ou
 *   - npm run import-panel
 *
 * Não conflita com o worker — usa perfil 0 (PuppeteerProfile), worker usa 1-5.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import type { Browser, Page } from 'puppeteer-core';
import { launchBrowser, loginToPanel } from './src/services/startpainel-puppeteer.js';

const BASE_URL = (process.env.STARTPAINEL_URL || 'https://cms.startpainel.cc').replace(/\/$/, '');

// ─── Lista de clientes a importar ─────────────────────────────────────────────
const USERNAMES = process.env.TEST_SINGLE ? [process.env.TEST_SINGLE] : [
  'morganatv2026',
  'Yuritv2026', 'wedsontv', 'Valdenorsilva', 'Tvholanda', 'Tvalanrua',
  'Tenfreitas', 'tenenteivo2026', 'Tenandre', 'Subleonardo', 'Subitamartv',
  'SUBDACOSTA', 'Subbelarmino', 'solimartv', 'solangeselcio', 'Sogfernandosogro',
  'sinal03', 'Sgttiotonio', 'sgtoseiastv', 'Sgtlima', 'Sgtgilvan',
  'Sgtfernando', 'sgtdeywes2026', 'Sgtalexandretv2', 'Sgtalexandrecl2', 'Severa',
  'Saboiamaster', 'saboiaibopg', 'Saboia', 'Ronaldocli', 'Robsontv2026',
  'Renataaguiar', 'renanrodrigues', 'Rejanecloud', 'Perlatv3', 'Novooriente',
  'Nenemtv', 'Neebaicinho', 'Nayrontv2026', 'Nailstv', 'Martinsveras',
  'martinely2027', 'Marcinhatv', 'manoelcl', 'Maninhatv', 'Liliancosta',
  'Lilatv', 'Leidianetv', 'Laercioquicktv', 'Laerciomae', 'juracy2026',
  'Joacilio', 'Jmatos', 'Jaciratv', 'Israeltv', 'Ismaelraio',
  'Irmaalexandre', 'Ipc2026', 'holandatc2025', 'Holanda2026', 'Hedmotv',
  'goiano', 'Gilsontv2027', 'Gilsintv2025', 'Gildenberg', 'gelianelima',
  'Francineide', 'Fernandotv2026', 'Fernandoquick', 'Fdiego', 'Fclima',
  'Fcampelo2026', 'Fabianovargas', 'Evandomartins', 'erisvaldo2026', 'edutec206',
  'edsonjrtv4', 'Eciliotv2026', 'djanetv2026', 'Diegosparta', 'daniel2026',
  'Crisibo2025', 'colimartv2', 'Clientebob', 'Cesinhatv206', 'Cbtiago',
  'Cbbomfimtv', 'Capvilartv', 'Caiorua', 'bulhoestv2027', 'Brotherraio',
  'Bosco2025', 'Bonfimtv', 'Beatrizlima', 'Barbosatv', 'Badatv2027',
  'Arissom', 'anasofia', 'amigomizael', 'alinebeulke', 'alexandrerezende2026',
  '7bpmcrat', '503644375',
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

interface PanelClient {
  username: string;
  status: 'active' | 'expired';
  expirationDate: string | null;  // YYYY-MM-DD
  linesCount: number;
  password?: string;
  playlistUrl?: string;
  name?: string;
  whatsapp?: string;
  comments?: string;
  appName?: string;
  appMac?: string;
  appPassword?: string;
}

// ─── Busca + extrai dados de um cliente ───────────────────────────────────────
async function searchAndExtractClient(page: Page, username: string): Promise<PanelClient | null> {
  // 1. Lista de clientes
  await page.goto(`${BASE_URL}/clients`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="search"]', { timeout: 15000 });
  await page.click('input[type="search"]', { clickCount: 3 });
  await page.type('input[type="search"]', username, { delay: 60 });
  await new Promise(r => setTimeout(r, 1600));

  // 2. Lê a row da tabela
  const rowText = await page.evaluate((uname: string) => {
    const rows = Array.from(document.querySelectorAll('tbody tr'));
    const target = rows.find(tr => {
      const cells = Array.from(tr.querySelectorAll('td'));
      return cells.some(td => (td.textContent || '').trim() === uname);
    });
    if (!target) return null;
    return Array.from(target.querySelectorAll('td')).map(td => (td.textContent || '').trim()).join(' | ');
  }, username);

  if (!rowText) return null;

  // Parse status / data / telas
  const status: 'active' | 'expired' = /expirado/i.test(rowText) ? 'expired' : 'active';
  const dateMatch = rowText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const expirationDate = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : null;

  // Telas: procura em cada celula separadamente (evita pegar a data DD/MM/YYYY).
  // Format esperado: "0/1", "2/3" - numeros pequenos sem dia/mes/ano.
  let linesCount = 1;
  const cells = rowText.split(' | ');
  for (const cell of cells) {
    const m = cell.trim().match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
    if (m) { linesCount = Number(m[2]); break; }
  }

  // 3. Clica Visualizar
  const clicked = await page.evaluate((uname: string) => {
    const rows = Array.from(document.querySelectorAll('tbody tr'));
    const target = rows.find(tr => {
      const cells = Array.from(tr.querySelectorAll('td'));
      return cells.some(td => (td.textContent || '').trim() === uname);
    });
    if (!target) return false;
    const btn = target.querySelector(
      'a[href*="/view"], a[title="Visualizar"], a[data-original-title="Visualizar"], .fa-eye'
    ) as HTMLElement | null;
    if (btn) { btn.click(); return true; }
    // Fallback: pega o primeiro link da action column
    const anyLink = target.querySelector('a[href*="/clients/"]') as HTMLElement | null;
    if (anyLink) { anyLink.click(); return true; }
    return false;
  }, username);

  if (!clicked) return { username, status, expirationDate, linesCount };

  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1400));

  // 3.5. Clica em "Visualizar" da "URL da lista" — abre lazymodal com o M3U
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('a, button')).find(
      el => (el.textContent || '').trim().toLowerCase() === 'visualizar'
    ) as HTMLElement | undefined;
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2200));

  // 4. Extrai dados da página de detalhe (incluindo modal aberto)
  const details = await page.evaluate(() => {
    let password: string | undefined;
    let m3u: string | undefined;
    let name: string | undefined;
    const debug: any = {};

    // Coleta TODOS os links e inputs da pagina para debug
    const allLinks = Array.from(document.querySelectorAll('a')).map(a => (a as HTMLAnchorElement).href).filter(h => h && h.startsWith('http'));
    const allInputValues = Array.from(document.querySelectorAll('input, textarea'))
      .map(el => (el as HTMLInputElement).value)
      .filter(v => v && v.length > 10);

    // M3U via inputs (qualquer URL que pareca M3U/playlist)
    const m3uPatterns = ['get.php', 'm3u', 'playlist', 'username=', 'xmltv.php'];
    const inputs = Array.from(document.querySelectorAll('input, textarea')) as HTMLInputElement[];
    for (const inp of inputs) {
      const v = (inp.value || '').trim();
      if (v.startsWith('http') && m3uPatterns.some(p => v.includes(p))) {
        m3u = v;
        const pm = v.match(/password=([^&\s"']+)/);
        if (pm && !password) password = decodeURIComponent(pm[1]);
        break;
      }
    }

    // Procura em LINKS tambem (<a href="...">)
    if (!m3u) {
      for (const href of allLinks) {
        if (m3uPatterns.some(p => href.includes(p))) {
          m3u = href;
          const pm = href.match(/password=([^&\s"']+)/);
          if (pm && !password) password = decodeURIComponent(pm[1]);
          break;
        }
      }
    }

    // Fallback: brute force no body
    if (!m3u) {
      const bodyText = document.body.innerText || '';
      const mm = bodyText.match(/https?:\/\/[^\s"']+(?:get\.php|\.m3u|playlist)[^\s"']*/i);
      if (mm) {
        m3u = mm[0];
        const pm = m3u.match(/password=([^&\s"']+)/);
        if (pm && !password) password = decodeURIComponent(pm[1]);
      }
    }

    debug.linksCount = allLinks.length;
    debug.inputsCount = allInputValues.length;
    debug.sampleLinks = allLinks.slice(0, 5);
    debug.sampleInputs = allInputValues.slice(0, 5).map(v => v.slice(0, 100));
    (globalThis as any).__debug = debug;

    // Procura "Senha:" explicito se ainda nao achou
    if (!password) {
      const els = Array.from(document.querySelectorAll('div, td, label, th, p, li, span'));
      for (let i = 0; i < els.length; i++) {
        const t = (els[i].textContent || '').trim();
        if (/^senha:?$/i.test(t)) {
          const nv = els[i].nextElementSibling?.textContent?.trim();
          if (nv && nv.length >= 3) { password = nv; break; }
        }
      }
    }

    // Procura "Nome:" se houver
    const els = Array.from(document.querySelectorAll('div, td, label, th, p, li, span'));
    for (let i = 0; i < els.length; i++) {
      const t = (els[i].textContent || '').trim();
      if (/^nome:?$/i.test(t)) {
        const nv = els[i].nextElementSibling?.textContent?.trim();
        if (nv && nv.length >= 2 && nv.length < 100) { name = nv; break; }
      }
    }

    // Extrai campo "Comentários" do painel
    let comments: string | undefined;
    for (let i = 0; i < els.length; i++) {
      const t = (els[i].textContent || '').trim();
      if (/^coment[aá]rios?:?$/i.test(t)) {
        const nv = els[i].nextElementSibling?.textContent?.trim();
        if (nv && nv.length >= 2) { comments = nv; break; }
      }
    }
    // Fallback: procura label "Comentários" em qualquer estrutura (ex: <td>Comentários</td><td>...</td>)
    if (!comments) {
      const bodyText = document.body.innerText || '';
      const cm = bodyText.match(/[Cc]oment[aá]rios?\s*[\n:]+\s*([\s\S]{5,500}?)(?:\n[A-Z][a-zA-Z ]+\s*\n|$)/);
      if (cm) comments = cm[1].trim();
    }

    return { password, m3u, name, comments, debug };
  });

  // Debug: se nao achou M3U, dump da pagina pra analise
  if (!details.m3u && process.env.TEST_SINGLE) {
    console.log('\n   [debug] M3U nao encontrado. Estado da pagina:');
    console.log('   ' + JSON.stringify(details.debug, null, 2).replace(/\n/g, '\n   '));
    console.log('   URL atual: ' + page.url());
    try {
      const shot = await page.screenshot({ encoding: 'base64', fullPage: true });
      const fs = await import('fs');
      const path = await import('path');
      const file = path.join(process.cwd(), `debug-${username}.png`);
      fs.writeFileSync(file, Buffer.from(shot as string, 'base64'));
      console.log(`   Screenshot salvo em: ${file}`);
    } catch {}
  }

  // Parseia comentários: Nome, Telefone, App, Mac, Senha do app
  let whatsapp: string | undefined;
  let appName: string | undefined;
  let appMac: string | undefined;
  let appPassword: string | undefined;
  let nameFromComments: string | undefined;

  if (details.comments) {
    const lines = details.comments.split(/\n/).map((l: string) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const telMatch = line.match(/telefone[:\s]+([+\d\s()\-]+)/i);
      if (telMatch) { whatsapp = telMatch[1].trim(); continue; }
      const appMatch = line.match(/app[^:]*?(?:usa|usa:|:)\s*(.+)/i);
      if (appMatch) { appName = appMatch[1].trim(); continue; }
      const macMatch = line.match(/mac[:\s]+([0-9a-fA-F:]+)/i);
      if (macMatch) { appMac = macMatch[1].trim(); continue; }
      const senhaMatch = line.match(/senha[:\s]+(\S+)/i);
      if (senhaMatch) { appPassword = senhaMatch[1].trim(); continue; }
      // Primeira linha sem label = nome do cliente
      if (!nameFromComments && !/[:\s](telefone|app|mac|senha)/i.test(line) && line.length >= 2 && line.length < 60) {
        nameFromComments = line;
      }
    }
  }

  return {
    username,
    status,
    expirationDate,
    linesCount,
    password: details.password,
    playlistUrl: details.m3u,
    name: details.name || nameFromComments,
    whatsapp,
    comments: details.comments,
    appName,
    appMac,
    appPassword,
  };
}

// ─── Upsert no banco ──────────────────────────────────────────────────────────
async function upsertCustomer(c: PanelClient): Promise<'created' | 'updated'> {
  const existing = await pool.query('SELECT id FROM customers WHERE username = $1', [c.username]);

  let customerId: number;

  if (existing.rowCount === 0) {
    const ins = await pool.query(
      `INSERT INTO customers (username, name, whatsapp, password, playlist_url, expiration_date, lines_count, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [c.username, c.name || null, c.whatsapp || null, c.password || null, c.playlistUrl || null, c.expirationDate, c.linesCount, c.status]
    );
    customerId = ins.rows[0].id;
  } else {
    customerId = existing.rows[0].id;
    await pool.query(
      `UPDATE customers SET
         password       = COALESCE($2, password),
         playlist_url   = COALESCE($3, playlist_url),
         expiration_date= COALESCE($4, expiration_date),
         lines_count    = $5,
         status         = $6,
         name           = COALESCE(NULLIF($7, ''), name),
         whatsapp       = COALESCE(NULLIF($8, ''), whatsapp),
         updated_at     = NOW()
       WHERE username = $1`,
      [c.username, c.password, c.playlistUrl, c.expirationDate, c.linesCount, c.status, c.name || null, c.whatsapp || null]
    );
  }

  // Salva app do cliente em customer_apps se tiver dados
  if (c.appName) {
    const appExists = await pool.query(
      `SELECT id FROM customer_apps WHERE customer_id = $1 AND app_name = $2`,
      [customerId, c.appName]
    );
    if (appExists.rowCount === 0) {
      await pool.query(
        `INSERT INTO customer_apps (customer_id, app_name, mac_address, password) VALUES ($1, $2, $3, $4)`,
        [customerId, c.appName, c.appMac || null, c.appPassword || null]
      );
    } else {
      await pool.query(
        `UPDATE customer_apps SET mac_address = COALESCE($3, mac_address), password = COALESCE($4, password)
         WHERE customer_id = $1 AND app_name = $2`,
        [customerId, c.appName, c.appMac || null, c.appPassword || null]
      );
    }
  }

  return existing.rowCount === 0 ? 'created' : 'updated';
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('🚀 Import StartPainel → DB');
  console.log(`   Total: ${USERNAMES.length} clientes`);
  console.log(`   Profile: PuppeteerProfile (separado do worker)\n`);

  let browser: Browser | null = null;
  const stats = { ok: 0, fail: 0, created: 0, updated: 0, noPass: 0, noM3u: 0 };
  const failures: string[] = [];

  try {
    browser = await launchBrowser(false, 0);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    console.log('[Login] Acessando painel...');
    if (!(await loginToPanel(page))) throw new Error('Login falhou — verifica .env STARTPAINEL_ADMIN_USER/PASS');
    console.log('[Login] OK\n');

    for (let i = 0; i < USERNAMES.length; i++) {
      const username = USERNAMES[i];
      const prefix = `[${String(i + 1).padStart(3, ' ')}/${USERNAMES.length}]`;
      try {
        process.stdout.write(`${prefix} ${username.padEnd(28)} ... `);
        const data = await searchAndExtractClient(page, username);
        if (!data) {
          stats.fail++;
          failures.push(`${username}: nao encontrado no painel`);
          console.log('❌ não encontrado');
          continue;
        }
        if (!data.password) stats.noPass++;
        if (!data.playlistUrl) stats.noM3u++;

        const result = await upsertCustomer(data);
        if (result === 'created') stats.created++; else stats.updated++;
        stats.ok++;

        const flags = [
          data.password ? '✓pass' : '✗pass',
          data.playlistUrl ? '✓m3u' : '✗m3u',
          data.whatsapp ? '✓tel' : '✗tel',
          data.appName ? `✓app(${data.appName})` : '✗app',
        ].join(' ');
        console.log(`✅ ${result.toUpperCase().padEnd(9)} exp:${data.expirationDate || '?'} telas:${data.linesCount} ${flags}`);
      } catch (e: any) {
        stats.fail++;
        const msg = e?.message || String(e);
        failures.push(`${username}: ${msg}`);
        console.log(`❌ ${msg}`);
      }
      await new Promise(r => setTimeout(r, 700));
    }

    console.log('\n══════════════════ RESUMO ══════════════════');
    console.log(`  Total processados: ${USERNAMES.length}`);
    console.log(`  ✅ Sucessos:        ${stats.ok}`);
    console.log(`  ❌ Falhas:          ${stats.fail}`);
    console.log(`  🆕 Criados:         ${stats.created}`);
    console.log(`  🔄 Atualizados:     ${stats.updated}`);
    console.log(`  ⚠️  Sem senha:      ${stats.noPass}`);
    console.log(`  ⚠️  Sem M3U:        ${stats.noM3u}`);
    if (failures.length > 0) {
      console.log('\nFalhas detalhadas:');
      failures.forEach(f => console.log(`  - ${f}`));
    }
    console.log('═════════════════════════════════════════════\n');
  } catch (e: any) {
    console.error('\nFATAL:', e?.message || e);
  } finally {
    if (browser) await browser.close().catch(() => {});
    await pool.end();
  }
})();
