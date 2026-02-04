import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/api/admin-auth';

// GET /api/admin/games/[id]/transactions — transaction ledger for a pod
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  const podId = params.id;
  const { searchParams } = new URL(req.url);
  const txType = searchParams.get('type');
  const txStatus = searchParams.get('status');

  let query = supabaseAdmin
    .from('game_transactions')
    .select(`
      id, tx_type, amount, wallet_from, wallet_to, tx_signature,
      tx_status, reason, round, created_at,
      agent:agents!agent_id (id, name)
    `)
    .eq('pod_id', podId)
    .order('created_at', { ascending: true });

  if (txType) query = query.eq('tx_type', txType);
  if (txStatus) query = query.eq('tx_status', txStatus);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Calculate totals
  const transactions = (data || []).map((t: any) => ({
    ...t,
    agent: Array.isArray(t.agent) ? t.agent[0] : t.agent,
  }));

  const totals = {
    entry_fees: transactions.filter(t => t.tx_type === 'entry_fee').reduce((s, t) => s + t.amount, 0),
    payouts: transactions.filter(t => t.tx_type.startsWith('payout_')).reduce((s, t) => s + t.amount, 0),
    refunds: transactions.filter(t => t.tx_type === 'refund').reduce((s, t) => s + t.amount, 0),
    rake: transactions.filter(t => t.tx_type === 'rake').reduce((s, t) => s + t.amount, 0),
  };

  return NextResponse.json({ transactions, totals });
}
