import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:startpainel_db_pass_2024@tqvwnbzn0gdnkkhl211aaal5:5432/postgres',
});

async function check() {
  const res = await pool.query("SELECT * FROM settings WHERE key LIKE 'evolution_%'");
  console.log(JSON.stringify(res.rows, null, 2));
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
