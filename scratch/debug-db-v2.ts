import pkg from 'pg';
const { Pool } = pkg;
const pool = new Pool({
  connectionString: 'postgres://postgres:EUUQna43FyrX3Vr74SYTihqqTkvQhMr630clCNtuJlfgeiS4I5lSkFUq7achOqsv@187.77.230.251:5436/postgres',
  ssl: false
});

async function check() {
  try {
    const messages = await pool.query("SELECT * FROM messages WHERE remote_jid IS NOT NULL ORDER BY created_at DESC LIMIT 10");
    console.log('Messages with Remote JID:', JSON.stringify(messages.rows, null, 2));
    
    const contacts = await pool.query("SELECT * FROM contacts ORDER BY updated_at DESC LIMIT 5");
    console.log('Recent Contacts:', JSON.stringify(contacts.rows, null, 2));

  } catch (e) {
    console.error('DB Error:', e);
  } finally {
    await pool.end();
  }
}
check();
