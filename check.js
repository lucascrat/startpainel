import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(() => client.query("SELECT key, value FROM settings WHERE key='evolution_api_url'")).then(res => console.log(res.rows)).catch(console.error).finally(() => client.end());
