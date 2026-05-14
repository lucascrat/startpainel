import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_STARTFLIX_URL;
const supabaseServiceKey = process.env.SUPABASE_STARTFLIX_SERVICE_KEY;

export const supabaseStartflix = (supabaseUrl && supabaseServiceKey) 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: 'startflix' }
    })
  : null;

export const supabaseAuthAdmin = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    }).auth.admin
  : null;

if (!supabaseStartflix) {
  console.warn('[Supabase] Startflix integration disabled: SUPABASE_STARTFLIX_URL or SUPABASE_STARTFLIX_SERVICE_KEY missing.');
}
