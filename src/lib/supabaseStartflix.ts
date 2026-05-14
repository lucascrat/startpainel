import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_STARTFLIX_URL || '';
const supabaseServiceKey = process.env.SUPABASE_STARTFLIX_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('[Supabase] Credenciais do Startflix não configuradas no .env');
}

export const supabaseStartflix = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  db: {
    schema: 'startflix'
  }
});

export const supabaseAuthAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
}).auth.admin;
