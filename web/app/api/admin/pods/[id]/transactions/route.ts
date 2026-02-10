// GET /api/admin/pods/[id]/transactions
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminAuth } from '@/lib/api/admin-auth';

export const runtime = 'nodejs';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not set');
  return createClient(url, key);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  const { id: podId } = await params;
  const supabaseAdmin = getSupabase();

  try {
    const { data: transactions, error } = await supabaseAdmin
      .from('game_transactions')
      .select('*')
      .eq('pod_id', podId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const mapped = (transactions || []).map((t) => ({
      id: t.id,
      type: t.tx_type,
      amount: t.amount / 1e9,
      from: t.wallet_from || 'System',
      to: t.wallet_to || 'Pod Vault',
      timestamp: t.created_at,
      status: t.tx_status,
      reason: t.reason,
    }));

    return NextResponse.json(mapped);
  } catch (err) {
    console.error('[Admin Transactions] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}
