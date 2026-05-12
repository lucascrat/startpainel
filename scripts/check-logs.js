import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function checkLogs() {
  try {
    const res = await pool.query("SELECT text, created_at FROM messages WHERE text LIKE '%⚠️%' ORDER BY created_at DESC LIMIT 5");
    console.log(res.rows);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

checkLogs();
