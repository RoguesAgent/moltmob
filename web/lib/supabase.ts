import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Server-side client (API routes only) — uses service role for full access.
// The anon key is intentionally NOT used. All data access goes through
// API routes (/api/v1, /api/admin, /api/gm) which enforce their own auth.
// RLS denies all access to the anon role.
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
