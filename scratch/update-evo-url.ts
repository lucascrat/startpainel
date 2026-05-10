import pkg from 'pg';
const { Pool } = pkg;
const pool = new Pool({
  connectionString: 'postgres://postgres:EUUQna43FyrX3Vr74SYTihqqTkvQhMr630clCNtuJlfgeiS4I5lSkFUq7achOqsv@187.77.230.251:5436/postgres',
  ssl: false
});

async function run() {
  try {
    await pool.query("UPDATE settings SET value = $1 WHERE key = $2", ['https://evo.appbr.pro', 'evolution_api_url']);
    console.log('Successfully updated evolution_api_url to https://evo.appbr.pro');
  } catch (e) {
    console.error('Update Error:', e);
  } finally {
    await pool.end();
  }
}
run();
