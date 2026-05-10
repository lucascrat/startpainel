import pkg from 'pg';
const { Pool } = pkg;
const pool = new Pool({
  connectionString: 'postgres://postgres:EUUQna43FyrX3Vr74SYTihqqTkvQhMr630clCNtuJlfgeiS4I5lSkFUq7achOqsv@187.77.230.251:5436/postgres',
  ssl: false
});

async function check() {
  try {
    const res = await pool.query("SELECT key, value FROM settings WHERE key LIKE 'evolution_%'");
    console.log('Evolution Settings:', JSON.stringify(res.rows, null, 2));
    
    const messages = await pool.query("SELECT * FROM messages ORDER BY created_at DESC LIMIT 5");
    console.log('Recent Messages:', JSON.stringify(messages.rows, null, 2));
    
  } catch (e) {
    console.error('DB Error:', e);
  } finally {
    await pool.end();
  }
}
check();
