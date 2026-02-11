import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authenticateRequest, errorResponse } from '@/lib/api/auth';
import { randomUUID } from 'crypto';

// POST /api/v1/pods/[id]/transactions — record a transaction
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: podId } = await params;
  
  const agentOrError = await authenticateRequest(req);
  if (agentOrError instanceof NextResponse) return agentOrError;

  const body = await req.json();
  const { tx_type, wallet, amount_lamports, tx_signature } = body;

  if (!tx_type || !wallet || amount_lamports === undefined) {
    return errorResponse('tx_type, wallet, and amount_lamports required', 400);
  }

  // Verify pod exists
  const { data: pod } = await supabaseAdmin
    .from('game_pods')
    .select('id')
    .eq('id', podId)
    .single();

  if (!pod) {
    return errorResponse('Pod not found', 404);
  }

  // Create transaction record
  const { data: transaction, error } = await supabaseAdmin
    .from('game_transactions')
    .insert({
      id: randomUUID(),
      pod_id: podId,
      tx_type,
      wallet,
      amount_lamports,
      tx_signature,
    })
    .select()
    .single();

  if (error) {
    return errorResponse(`Failed to record transaction: ${error.message}`, 500);
  }

  return NextResponse.json({ success: true, transaction }, { status: 201 });
}

// GET /api/v1/pods/[id]/transactions — list transactions for a pod
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: podId } = await params;
  
  const agentOrError = await authenticateRequest(req);
  if (agentOrError instanceof NextResponse) return agentOrError;

  const { data: transactions, error } = await supabaseAdmin
    .from('game_transactions')
    .select('*')
    .eq('pod_id', podId)
    .order('created_at', { ascending: true });

  if (error) {
    return errorResponse(`Failed to fetch transactions: ${error.message}`, 500);
  }

  return NextResponse.json({ transactions });
}
