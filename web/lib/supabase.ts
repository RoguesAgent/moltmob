import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

// Server-side client (API routes) — uses service role for full access
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Client-side client (browser) — uses anon key with RLS
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
