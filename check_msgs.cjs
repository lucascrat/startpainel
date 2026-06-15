const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    const res = await pool.query("SELECT remote_jid, sender, text, created_at FROM messages ORDER BY created_at DESC LIMIT 100");
    
    // Group by remote_jid
    const chats = {};
    for (const row of res.rows) {
      if (!chats[row.remote_jid]) {
        chats[row.remote_jid] = [];
      }
      chats[row.remote_jid].unshift(row); // reverse order so oldest is first in the array
    }

    // Print out the recent conversations
    for (const [jid, msgs] of Object.entries(chats)) {
      console.log("\n=== CHAT WITH " + jid + " ===");
      for (const msg of msgs) {
        console.log("[" + msg.created_at.toISOString() + "] " + msg.sender + ": " + msg.text);
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
