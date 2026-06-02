const { Pool } = require("pg");
require("dotenv").config();
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const r = await pool.query(
    "SELECT username, password, playlist_url, expiration_date, lines_count, status, name FROM customers WHERE username = $1",
    [process.argv[2] || "Yuritv2026"]
  );
  console.log(JSON.stringify(r.rows[0], null, 2));
  await pool.end();
})();
