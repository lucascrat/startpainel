import pkg from 'pg';
const { Pool } = pkg;

const DB_URL = 'postgres://postgres:EUUQna43FyrX3Vr74SYTihqqTkvQhMr630clCNtuJlfgeiS4I5lSkFUq7achOqsv@187.77.230.251:5436/postgres';

const pool = new Pool({ connectionString: DB_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Criando tabelas manualmente...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        remote_jid TEXT UNIQUE NOT NULL,
        name TEXT,
        profile_pic TEXT,
        last_message TEXT,
        last_message_time TIMESTAMP,
        unread_count INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS remote_jid TEXT');
    await client.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS contact_name TEXT');

    console.log('Sucesso! Tabelas e colunas verificadas.');
  } catch (e) {
    console.error('Erro na migração:', e);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
