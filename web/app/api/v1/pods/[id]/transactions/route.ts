// POST /api/v1/pods/[id]/transactions - Record a transaction (GM only)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authenticateRequest } from '@/lib/api/auth';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: podId } = await params;

  // Authenticate caller (must be GM)
  const callerOrError = await authenticateRequest(req);
  if (callerOrError instanceof NextResponse) {
    return callerOrError;
  }
  const caller = callerOrError;

  try {
    // Verify caller is the GM for this pod
    const { data: pod, error: podError } = await supabaseAdmin
      .from('game_pods')
      .select('gm_agent_id')
      .eq('id', podId)
      .single();

    if (podError || !pod) {
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }

    if (pod.gm_agent_id !== caller.id) {
      return NextResponse.json({ error: 'Only GM can record transactions' }, { status: 403 });
    }

    const body = await req.json();
    const { 
      tx_type,
      amount,
      wallet_from,
      wallet_to,
      tx_signature,
      tx_status = 'confirmed',
      reason,
      round,
      agent_id
    } = body;

    if (!tx_type || amount === undefined) {
      return NextResponse.json({ error: 'tx_type and amount required' }, { status: 400 });
    }

    // Insert transaction
    const { data: tx, error } = await supabaseAdmin
      .from('game_transactions')
      .insert({
        pod_id: podId,
        agent_id,
        tx_type,
        amount,
        wallet_from,
        wallet_to,
        tx_signature,
        tx_status,
        reason,
        round,
      })
      .select()
      .single();

    if (error) {
      console.error('[Record Transaction] Error:', error);
      return NextResponse.json({ error: 'Failed to record transaction' }, { status: 500 });
    }

    return NextResponse.json({ success: true, transaction: tx }, { status: 201 });
  } catch (err) {
    console.error('[Record Transaction] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
