import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireGmAuth } from '@/lib/api/gm-auth';

// POST /api/gm/pods/[id]/transactions — GM records a transaction
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = requireGmAuth(req);
  if (authError) return authError;

  const body = await req.json();
  const { agent_id, agent_name, tx_type, amount, wallet_from, wallet_to, tx_signature, tx_status, reason, round } = body;

  if (!tx_type || amount === undefined) {
    return NextResponse.json({ error: 'tx_type and amount required' }, { status: 400 });
  }

  // Resolve agent (null for rake)
  let resolvedAgentId = agent_id || null;
  if (!resolvedAgentId && agent_name) {
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('name', agent_name)
      .single();
    resolvedAgentId = agent?.id || null;
  }

  const { data, error } = await supabaseAdmin
    .from('game_transactions')
    .insert({
      pod_id: params.id,
      agent_id: resolvedAgentId,
      tx_type,
      amount,
      wallet_from: wallet_from || null,
      wallet_to: wallet_to || null,
      tx_signature: tx_signature || null,
      tx_status: tx_status ?? 'pending',
      reason: reason || null,
      round: round ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ transaction: data }, { status: 201 });
}

// PATCH /api/gm/pods/[id]/transactions — GM updates tx status (e.g., pending → confirmed)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = requireGmAuth(req);
  if (authError) return authError;

  const body = await req.json();
  const { transaction_id, tx_signature, tx_status } = body;

  if (!transaction_id) {
    return NextResponse.json({ error: 'transaction_id required' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (tx_signature !== undefined) updates.tx_signature = tx_signature;
  if (tx_status !== undefined) updates.tx_status = tx_status;

  const { data, error } = await supabaseAdmin
    .from('game_transactions')
    .update(updates)
    .eq('id', transaction_id)
    .eq('pod_id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ transaction: data });
}
