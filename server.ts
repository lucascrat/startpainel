import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';
import Gerencianet from 'gn-api-sdk-node';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import pkg from 'pg';
const { Pool } = pkg;

// Initialize Postgres Pool
const DB_URL = process.env.DATABASE_URL || 'postgres://postgres:EUUQna43FyrX3Vr74SYTihqqTkvQhMr630clCNtuJlfgeiS4I5lSkFUq7achOqsv@187.77.230.251:5436/postgres';

console.log('PG: Checking database connection...');
if (!process.env.DATABASE_URL) {
  console.log('PG: Using fallback URL provided by user');
} else {
  console.log('PG: DATABASE_URL environment variable is present');
}

const pool = new Pool({
  connectionString: DB_URL,
  ssl: false, // Forces SSL off to test connection to public IP
  connectionTimeoutMillis: 10000 // 10 seconds timeout
});

pool.on('error', (err) => {
  console.error('PG: Unexpected error on idle client', err);
});

let dbStatus = 'connecting';
let dbError = '';

// Initialize DB tables
async function initDB() {
  try {
    console.log('PostgreSQL: Attempting to initialize database...');
    if (!DB_URL) throw new Error("DATABASE_URL is not defined");

    const client = await pool.connect();
    console.log('PG: Successfully connected to PostgreSQL server');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        whatsapp VARCHAR(100),
        renewal_price DECIMAL(10, 2) DEFAULT 49.90,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS pix_charges (
        txid VARCHAR(255) PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'ATIVA',
        processed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('PostgreSQL: Tables "customers" and "pix_charges" checked/created successfully');
    client.release();
    dbStatus = 'connected';
  } catch (err: any) {
    console.error('PostgreSQL: Initialization error:', err);
    dbStatus = 'error';
    dbError = err.message;
  }
}
initDB();

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

// Initialize Firebase for Backend
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp, firebaseConfig.firestoreDatabaseId);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = 3000;

// Initialize Efibank Certificate if provided as raw content
if (process.env.EFIBANK_CERT_PATH && (process.env.EFIBANK_CERT_PATH.length > 500 || process.env.EFIBANK_CERT_PATH.includes('MII'))) {
  try {
    const tempCertPath = path.resolve(process.cwd(), 'temp_cert.p12');
    const buffer = Buffer.from(process.env.EFIBANK_CERT_PATH, 'base64');
    fs.writeFileSync(tempCertPath, buffer);
    console.log('Efibank: Certificado extraído para arquivo temporário com sucesso.');
  } catch (e) {
    console.error('Efibank: Erro ao extrair certificado do ENV:', e);
  }
}

// Efibank setup
function getEfibankClient() {
  const isSandbox = process.env.EFIBANK_SANDBOX === 'true';
  const clientId = process.env.EFIBANK_CLIENT_ID;
  const clientSecret = process.env.EFIBANK_CLIENT_SECRET;
  const certPathStr = process.env.EFIBANK_CERT_PATH;

  if (!clientId || !clientSecret) {
    throw new Error('EFIBANK_CLIENT_ID ou EFIBANK_CLIENT_SECRET não configurados no .env');
  }

  let finalCertPath = '';
  if (certPathStr) {
    if (certPathStr.length > 500 || certPathStr.includes('MII')) {
      finalCertPath = path.resolve(process.cwd(), 'temp_cert.p12');
    } else {
      finalCertPath = path.isAbsolute(certPathStr) ? certPathStr : path.resolve(process.cwd(), certPathStr);
    }
  } else {
    // Fallback para arquivos conhecidos se o path não estiver no env
    const fallbackFile = isSandbox ? 'homologacao-906554-shopcrat.p12' : 'producao-906554-shopcrat.p12';
    finalCertPath = path.resolve(process.cwd(), fallbackFile);
  }

  if (!fs.existsSync(finalCertPath)) {
    throw new Error(`Certificado Efibank não encontrado em: ${finalCertPath}`);
  }

  const efibankOptions = {
    sandbox: isSandbox,
    client_id: clientId,
    client_secret: clientSecret,
    certificate: finalCertPath,
  };
  
  return new Gerencianet(efibankOptions);
}

// StartPainel Automation Class
class StartPainelService {
  private client;
  private jar: CookieJar;

  constructor() {
    this.jar = new CookieJar();
    this.client = wrapper(axios.create({ 
      jar: this.jar, 
      withCredentials: true,
      baseURL: process.env.STARTPAINEL_URL || 'https://cms.startpainel.cc'
    }));
  }

  async login() {
    try {
      const response = await this.client.post('/login', {
        username: process.env.STARTPAINEL_ADMIN_USER,
        password: process.env.STARTPAINEL_ADMIN_PASS,
      });
      return response.status === 200;
    } catch (error) {
      console.error('StartPainel Login Error:', error);
      return false;
    }
  }

  async findClient(username: string) {
    try {
      console.log(`StartPainel: Searching for client "${username}"...`);
      const response = await this.client.get(`/clients?search=${username}`);
      const html = response.data.toString();
      
      // More flexible regex for different HTML styles
      const match = html.match(/\/clients\/(\d+)\/(edit|show|renew|duplicate|info)/i);
      
      if (match && match[1]) {
        console.log(`StartPainel: Found client ID ${match[1]} for username ${username}`);
        return { id: match[1] };
      }

      // Try searching for the username followed by an ID in the table
      const tableMatch = html.match(new RegExp(`${username}.*?data-id=["'](\\d+)["']`, 'i')) || 
                         html.match(new RegExp(`${username}.*?id=["'](\\d+)["']`, 'i'));
      
      if (tableMatch && tableMatch[1]) {
        console.log(`StartPainel: Found client ID ${tableMatch[1]} via table attribute for ${username}`);
        return { id: tableMatch[1] };
      }

      // Final fallback: Look for ANY ID near the username text
      const textMatch = html.match(new RegExp(`>${username}<.*?/clients/(\\d+)/`, 'i')) ||
                        html.match(new RegExp(`${username}.*?/clients/(\\d+)/`, 'i'));
      
      if (textMatch && textMatch[1]) {
        console.log(`StartPainel: Found client ID ${textMatch[1]} via text proximity for ${username}`);
        return { id: textMatch[1] };
      }

      console.log('StartPainel: Could not find client ID in HTML response.');
      return null;
    } catch (error: any) {
      console.error('StartPainel Search Error:', error.message);
      return null;
    }
  }

  async extendClient(clientId: string) {
    try {
      console.log(`StartPainel: Attempting to extend client ${clientId}...`);
      
      // Try common endpoints for renewal/extension
      const endpoints = [`/clients/${clientId}/extend`, `/clients/${clientId}/renew`, `/clients/${clientId}/duplicate` ];
      
      for (const endpoint of endpoints) {
        try {
          console.log(`StartPainel: Trying endpoint ${endpoint}`);
          const response = await this.client.post(endpoint, {
            duration: '1',
            connections: '1'
          });
          
          if (response.status === 200 || response.status === 302) {
            console.log(`StartPainel: Success at ${endpoint} (Status: ${response.status})`);
            return true;
          }
        } catch (e: any) {
          console.log(`StartPainel: Failed at ${endpoint}: ${e.message}`);
        }
      }
      
      return false;
    } catch (error: any) {
      console.error('StartPainel Extend Error:', error.message);
      return false;
    }
  }
}

const panelService = new StartPainelService();

// --- API ROUTES ---

// Manual Renewal Route for Admin
app.post('/api/panel/renew/:username', async (req, res) => {
  const { username } = req.params;
  try {
    console.log(`Admin: Manual renewal requested for ${username}`);
    const loggedIn = await panelService.login();
    if (!loggedIn) throw new Error('Falha no login do Painel');

    const client = await panelService.findClient(username);
    if (!client) throw new Error(`Cliente ${username} não encontrado no Painel`);

    const success = await panelService.extendClient(client.id);
    if (success) {
      res.json({ success: true, message: `Cliente ${username} renovado com sucesso (ID: ${client.id})` });
    } else {
      res.status(500).json({ error: `Falha ao estender cliente ${username} no Painel` });
    }
  } catch (err: any) {
    console.error('Manual Renewal Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- PG DATABASE ROUTES ---
app.get('/api/db-status', (req, res) => {
  res.json({ status: dbStatus, error: dbError });
});

app.get('/api/customers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar clientes no Postgres', details: err.message });
  }
});

app.post('/api/customers', express.json(), async (req, res) => {
  const { username, whatsapp, renewalPrice } = req.body;
  console.log('PG: Creating customer:', { username, whatsapp, renewalPrice });
  try {
    const result = await pool.query(
      'INSERT INTO customers (username, whatsapp, renewal_price) VALUES ($1, $2, $3) RETURNING *',
      [username, whatsapp, renewalPrice || 49.90]
    );
    console.log('PG: Customer created successfully:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('PG: Error creating customer:', err);
    res.status(500).json({ error: 'Erro ao criar cliente no Postgres', details: err.message });
  }
});

app.put('/api/customers/:id', express.json(), async (req, res) => {
  const { id } = req.params;
  const { renewalPrice } = req.body;
  try {
    const result = await pool.query(
      'UPDATE customers SET renewal_price = $1 WHERE id = $2 RETURNING *',
      [renewalPrice, id]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao atualizar cliente no Postgres', details: err.message });
  }
});

app.delete('/api/customers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM customers WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao excluir cliente no Postgres', details: err.message });
  }
});

// Efibank Pix Generation
app.get('/api/pix/status/:txid', async (req, res) => {
  const { txid } = req.params;
  try {
    const gn = getEfibankClient();
    const response = await gn.pixDetailCharge({ txid });
    const status = response.status;
    
    // Check if we need to process renewal
    if (status === 'CONCLUIDA') {
      const chargeResult = await pool.query('SELECT * FROM pix_charges WHERE txid = $1', [txid]);
      const charge = chargeResult.rows[0];
      
      if (charge && !charge.processed) {
        console.log(`PG: Payment confirmed for TXID ${txid}. Triggering renewal for ${charge.username}...`);
        
        try {
          // Trigger renewal
          const loggedIn = await panelService.login();
          if (loggedIn) {
            const client = await panelService.findClient(charge.username);
            if (client) {
              const success = await panelService.extendClient(client.id);
              if (success) {
                console.log(`PG: Renewal successful for ${charge.username}`);
                await pool.query('UPDATE pix_charges SET processed = true, status = $1 WHERE txid = $2', [status, txid]);
                
                // Add a message to chat via Firebase if possible (but we don't have the context here easily without a taskId/chatId)
                // For now, the user's polling will see the status change to CONCLUIDA.
              } else {
                console.error(`PG: Panel extension failed for ${charge.username}`);
              }
            } else {
              console.error(`PG: Client ${charge.username} not found in panel`);
            }
          } else {
            console.error('PG: Panel login failed during automatic renewal');
          }
        } catch (renewError) {
          console.error('PG: Error during automatic renewal:', renewError);
        }
      } else {
        // Just update status if already processed or not found
        await pool.query('UPDATE pix_charges SET status = $1 WHERE txid = $2', [status, txid]);
      }
    } else {
      // Update status for non-concluded charges
      await pool.query('UPDATE pix_charges SET status = $1 WHERE txid = $2', [status, txid]);
    }
    
    res.json({ status }); 
  } catch (error) {
    console.error('Efibank Detail Error:', error);
    res.status(500).json({ error: 'Erro ao consultar Pix' });
  }
});

// Debug route to check Efibank setup
app.get('/api/pix/debug', (req, res) => {
  const isSandbox = process.env.EFIBANK_SANDBOX === 'true';
  const clientId = process.env.EFIBANK_CLIENT_ID;
  const clientSecret = process.env.EFIBANK_CLIENT_SECRET;
  const certPathStr = process.env.EFIBANK_CERT_PATH;
  const pixKey = process.env.EFIBANK_PIX_KEY;

  const fallbackFile = isSandbox ? 'homologacao-906554-shopcrat.p12' : 'producao-906554-shopcrat.p12';
  let finalCertPath = '';
  let usingTemp = false;

  if (certPathStr) {
    if (certPathStr.length > 500 || certPathStr.includes('MII')) {
      finalCertPath = path.resolve(process.cwd(), 'temp_cert.p12');
      usingTemp = true;
    } else {
      finalCertPath = path.isAbsolute(certPathStr) ? certPathStr : path.resolve(process.cwd(), certPathStr);
    }
  } else {
    finalCertPath = path.resolve(process.cwd(), fallbackFile);
  }

  res.json({
    hasClientId: !!clientId,
    hasClientSecret: !!clientSecret,
    isSandbox,
    certPath: finalCertPath,
    certExists: fs.existsSync(finalCertPath),
    usingTemp,
    hasPixKey: !!pixKey && pixKey !== 'REPLACE_WITH_YOUR_PIX_KEY',
    pixKey: pixKey === 'REPLACE_WITH_YOUR_PIX_KEY' ? 'NOT_SET' : (pixKey ? 'SET' : 'MISSING'),
    nodeEnv: process.env.NODE_ENV
  });
});

app.post('/api/pix/create', async (req, res) => {
  const { amount, username } = req.body;
  
  if (!process.env.EFIBANK_PIX_KEY || process.env.EFIBANK_PIX_KEY === 'REPLACE_WITH_YOUR_PIX_KEY') {
    return res.status(400).json({ error: 'Chave Pix não configurada pelo administrador.' });
  }

  const body = {
    calendario: {
      expiracao: 3600,
    },
    valor: {
      original: parseFloat(amount).toFixed(2),
    },
    chave: process.env.EFIBANK_PIX_KEY,
    solicitacaoPagador: `Renovação StartPainel - ${username}`.substring(0, 140),
  };

  try {
    const gn = getEfibankClient();
    const response = await gn.pixCreateImmediateCharge({}, body);
    const qrcodeResponse = await gn.pixGenerateQRCode({ id: response.loc.id });
    
    // Save to database
    await pool.query(
      'INSERT INTO pix_charges (txid, username, amount) VALUES ($1, $2, $3)',
      [response.txid, username, amount]
    );
    
    res.json({
      qrcode_image: qrcodeResponse.imagemQrcode,
      copy_paste: qrcodeResponse.qrcode,
      txid: response.txid,
    });
  } catch (error: any) {
    console.error('Efibank Error Details:', error.mensagem || error.message || error);
    if (error.error_description) console.error('Description:', error.error_description);
    
    // Return more details to the frontend for debugging
    const errorMessage = error.mensagem || error.message || 'Erro ao gerar Pix na Efibank';
    const errorDetail = error.error_description || (error.erros ? JSON.stringify(error.erros) : '');
    
    res.status(500).json({ 
      error: errorMessage, 
      details: errorDetail
    });
  }
});

// Webhook for Pix Payment
app.post('/api/pix/webhook', async (req, res) => {
  const { pix } = req.body;
  if (!pix || pix.length === 0) return res.sendStatus(200);

  for (const p of pix) {
    const txid = p.txid;
    console.log(`PG: Webhook message: Pagamento Pix recebido! TXID: ${txid}`);
    
    // Check if we need to process renewal
    const chargeResult = await pool.query('SELECT * FROM pix_charges WHERE txid = $1', [txid]);
    const charge = chargeResult.rows[0];
    
    if (charge && !charge.processed) {
      console.log(`PG: Webhook processing payment for ${charge.username}...`);
      
      try {
        const loggedIn = await panelService.login();
        if (loggedIn) {
          const client = await panelService.findClient(charge.username);
          if (client) {
            const success = await panelService.extendClient(client.id);
            if (success) {
              console.log(`PG: Renewal successful via Webhook for ${charge.username}`);
              await pool.query('UPDATE pix_charges SET processed = true, status = $1 WHERE txid = $2', ['CONCLUIDA', txid]);
            }
          }
        }
      } catch (err) {
        console.error('PG: Webhook renewal error:', err);
      }
    }
  }
  
  res.sendStatus(200);
});

// Force Renew Route for Testing
app.post('/api/test/force-renew/:txid', async (req, res) => {
  const { txid } = req.params;
  try {
    const chargeResult = await pool.query('SELECT * FROM pix_charges WHERE txid = $1', [txid]);
    const charge = chargeResult.rows[0];
    
    if (!charge) {
      return res.status(404).json({ error: 'Cobrança não encontrada no banco local' });
    }

    console.log(`TEST: Forcing renewal for ${charge.username} (TXID: ${txid})`);
    
    const loggedIn = await panelService.login();
    if (!loggedIn) throw new Error('Login no Painel falhou');

    const client = await panelService.findClient(charge.username);
    if (!client) throw new Error(`Cliente ${charge.username} não encontrado no painel`);

    const success = await panelService.extendClient(client.id);
    if (success) {
      await pool.query('UPDATE pix_charges SET processed = true, status = $1 WHERE txid = $2', ['CONCLUIDA', txid]);
      res.json({ success: true, message: `Renovação forçada com sucesso para ${charge.username}` });
    } else {
      res.status(500).json({ error: 'Falha ao estender cliente no painel' });
    }
  } catch (err: any) {
    console.error('Test Force Renew Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// StartPainel Automation manual trigger
app.post('/api/panel/extend', async (req, res) => {
  const { username } = req.body;
  try {
    const loggedIn = await panelService.login();
    if (!loggedIn) throw new Error('Falha no login do painel');

    const client = await panelService.findClient(username);
    if (!client) throw new Error('Cliente não encontrado');

    const success = await panelService.extendClient(client.id);
    if (!success) throw new Error('Falha ao extender cliente');

    res.json({ success: true, message: `Usuário ${username} renovado com sucesso.` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- VITE MIDDLEWARE ---

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
