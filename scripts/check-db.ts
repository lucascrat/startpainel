import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

const DB_URL = 'postgres://postgres:EUUQna43FyrX3Vr74SYTihqqTkvQhMr630clCNtuJlfgeiS4I5lSkFUq7achOqsv@187.77.230.251:5436/postgres';

const pool = new Pool({ connectionString: DB_URL });

async function check() {
  try {
    const res = await pool.query('SELECT * FROM contacts ORDER BY last_message_time DESC LIMIT 5');
    console.log('Contacts found:', res.rows.length);
    res.rows.forEach(c => {
      console.log(`- ${c.name} (${c.remote_jid}): ${c.last_message}`);
    });
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await pool.end();
  }
}

check();
