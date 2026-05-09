import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const API_TOKEN = '1|LzTBaWbm06FtyXsXbYOkxs13tm3e5CpuPaintgqU389d01cd';
const BASE_URL = 'http://84.247.138.242:8000/api/v1';
const APP_UUID = 'g10dd9izazw3xx5yyco506ob';
const DB_URL = 'postgres://postgres:startpainel_db_pass_2024@tqvwnbzn0gdnkkhl211aaal5:5432/postgres';

const envVars = [
  { key: 'DATABASE_URL', value: DB_URL },
  { key: 'EFIBANK_CLIENT_ID', value: 'Client_Id_62a2fe6ca801b2a8c7c688c6d1cc425aca747df4' },
  { key: 'EFIBANK_CLIENT_SECRET', value: 'Client_Secret_c7101c6e1f68b0860eec3b57abe31ec8c7f46a42' },
  { key: 'EFIBANK_SANDBOX', value: 'true' },
  { key: 'EFIBANK_PIX_KEY', value: 'fab4cde3-4367-4d0b-aa9b-4528dc04d371' },
  { key: 'STARTPAINEL_URL', value: 'https://cms.startpainel.cc' },
  { key: 'STARTPAINEL_ADMIN_USER', value: 'Lucas24H1' },
  { key: 'STARTPAINEL_ADMIN_PASS', value: '01Deus02' },
  { key: 'EFIBANK_CERT_PATH', value: process.env.EFIBANK_CERT_PATH || '' },
  { key: 'NODE_ENV', value: 'production' }
];

async function setEnvs() {
  for (const env of envVars) {
    console.log(`Setting ${env.key}...`);
    try {
      await axios.post(`${BASE_URL}/applications/${APP_UUID}/envs`, {
        key: env.key,
        value: env.value,
        is_preview: false,
        is_literal: true
      }, {
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      console.log(`Done ${env.key}`);
    } catch (err) {
      console.error(`Error setting ${env.key}:`, err.response?.data || err.message);
    }
  }
}

setEnvs();
