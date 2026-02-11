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
  const { tx_type, wallet, wallet_to, amount_lamports, amount, tx_signature, reason, round } = body;

  // Support both field names for compatibility
  const finalWallet = wallet_to || wallet;
  const finalAmount = amount ?? amount_lamports;

  if (!tx_type || !finalWallet || finalAmount === undefined) {
    return errorResponse('tx_type, wallet/wallet_to, and amount/amount_lamports required', 400);
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
      wallet_to: finalWallet,
      amount: finalAmount,
      tx_signature,
      tx_status: tx_signature ? 'confirmed' : 'pending',
      reason,
      round,
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
