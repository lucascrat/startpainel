import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgres://postgres:startpainel_db_pass_2024@84.247.138.242:5432/postgres',
  ssl: false
});

const newDns = [
  'http://starton.sbs:8880/',
  'http://qtiv410.top/'
];

try {
  // Mostrar DNS atual
  const cur = await pool.query("SELECT value FROM settings WHERE key = 'app_dns_list'");
  console.log('DNS atual:', cur.rows[0]?.value ?? '(vazio)');

  // Atualizar
  await pool.query(
    "INSERT INTO settings(key, value, updated_at) VALUES('app_dns_list', $1, NOW()) ON CONFLICT(key) DO UPDATE SET value=$1, updated_at=NOW()",
    [JSON.stringify(newDns)]
  );
  console.log('DNS atualizado para:', JSON.stringify(newDns));
} finally {
  await pool.end();
}
