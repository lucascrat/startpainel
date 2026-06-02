/**
 * Scrape completo do catálogo AtiveApp:
 * - Abre o modal de Nova Ativação
 * - Captura nome, créditos e URL do ícone de cada app
 * - Salva no banco na tabela ativeapp_catalog
 */
import dotenv from 'dotenv';
dotenv.config();
import { launchBrowser } from '../src/services/startpainel-puppeteer.js';
import pg from 'pg';
import fs from 'fs';
import https from 'https';
import path from 'path';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const EMAIL    = process.env.ATIVEAPP_EMAIL    || '';
const PASSWORD = process.env.ATIVEAPP_PASSWORD || '';
const ACTIV    = 'https://www.ativeapp.com/reseller/activations';

// Baixa imagem de uma URL e retorna buffer
function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  // Cria tabela se não existir
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ativeapp_catalog (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      credits DECIMAL(10,2) DEFAULT 0.9,
      icon_url TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('✅ Tabela ativeapp_catalog pronta.');

  const browser: any = await launchBrowser(false, 98);
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  // Acessa ativações
  await page.goto(ACTIV, { waitUntil: 'networkidle2', timeout: 30_000 });
  await new Promise(r => setTimeout(r, 4000));

  // Login se necessário
  if (page.url().includes('/auth') || page.url().includes('/login')) {
    console.log('Fazendo login...');
    await page.waitForSelector('input[type="email"]', { visible: true, timeout: 10_000 });
    await page.click('input[type="email"]');
    await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
    await page.type('input[type="email"]', EMAIL, { delay: 50 });
    await page.click('input[type="password"]');
    await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
    await page.type('input[type="password"]', PASSWORD, { delay: 50 });
    await page.evaluate(() => {
      const cb = document.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      if (cb && !cb.checked) cb.click();
      const btn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').toLowerCase().includes('entrar'));
      (btn as HTMLElement)?.click();
    });
    const dl = Date.now() + 25_000;
    while (Date.now() < dl) {
      await new Promise(r => setTimeout(r, 2000));
      if (!page.url().includes('/auth') && !page.url().includes('/login')) break;
    }
    if (!page.url().includes('/activations')) {
      await page.goto(ACTIV, { waitUntil: 'networkidle2', timeout: 30_000 });
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // Abre modal Nova Ativação
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button, a')).find(b => {
      const t = (b.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim();
      return t.includes('nova ativa') || t.includes('ativar um app');
    });
    (btn as HTMLElement)?.click();
  });
  await new Promise(r => setTimeout(r, 2500));

  // Abre o combobox de apps
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b =>
      (b.textContent || '').trim().toLowerCase().includes('selecione um aplicativo')
    );
    (btn as HTMLElement)?.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  // Captura todos os [role="option"] com ícone e texto
  const apps: { name: string; credits: number; iconUrl: string | null }[] = await page.evaluate(() => {
    const options = Array.from(document.querySelectorAll('[role="option"]'));
    return options.map(opt => {
      const img = opt.querySelector('img') as HTMLImageElement | null;
      const text = (opt.textContent || '').trim();
      // Texto tem formato "NOME DO APP0.9" — extrai créditos do final numérico
      const match = text.match(/^(.+?)(\d+\.\d+)$/);
      const name    = match ? match[1].trim() : text;
      const credits = match ? parseFloat(match[2]) : 0.9;
      return { name, credits, iconUrl: img?.src || null };
    }).filter(a => a.name.length > 0);
  });

  console.log(`\n📋 ${apps.length} apps encontrados. Salvando no banco...\n`);

  let inserted = 0;
  let updated  = 0;

  for (const app of apps) {
    try {
      const existing = await pool.query('SELECT id FROM ativeapp_catalog WHERE name = $1', [app.name]);
      if (existing.rows.length > 0) {
        await pool.query(
          'UPDATE ativeapp_catalog SET credits = $1, icon_url = $2, updated_at = NOW() WHERE name = $3',
          [app.credits, app.iconUrl, app.name]
        );
        updated++;
      } else {
        await pool.query(
          'INSERT INTO ativeapp_catalog (name, credits, icon_url) VALUES ($1, $2, $3)',
          [app.name, app.credits, app.iconUrl]
        );
        inserted++;
      }
      process.stdout.write(`  ✓ ${app.name} (${app.credits} créditos)\n`);
    } catch (e: any) {
      console.error(`  ✗ Erro em "${app.name}": ${e.message}`);
    }
  }

  await browser.close();
  await pool.end();

  console.log(`\n🎉 Concluído! Inseridos: ${inserted} | Atualizados: ${updated} | Total: ${apps.length}`);
  process.exit(0);
})();
