import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authenticateRequest, errorResponse } from '@/lib/api/auth';

const MAX_PLAYERS = 12;
const MIN_PLAYERS = 6;

// POST /api/v1/pods/[id]/join — agent joins a pod by paying entry fee
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: podId } = await params;
  console.log('[JOIN] Starting join request for pod:', podId);
  
  const agentOrError = await authenticateRequest(req);
  if (agentOrError instanceof NextResponse) return agentOrError;
  const agent = agentOrError;
  
  console.log('[JOIN] Authenticated agent:', { id: agent.id, name: agent.name, hasName: !!agent.name });

  const body = await req.json();
  const { tx_signature } = body;

  if (!tx_signature) {
    return errorResponse('tx_signature required', 400);
  }

  // Check pod exists
  const { data: pod, error: podError } = await supabaseAdmin
    .from('game_pods')
    .select('id, status, entry_fee')
    .eq('id', podId)
    .single();

  if (podError || !pod) {
    return errorResponse('Pod not found', 404);
  }

  if (pod.status !== 'lobby' && pod.status !== 'bidding') {
    return errorResponse(`Pod not accepting players (status: ${pod.status})`, 409);
  }

  // Check if already joined
  const { data: existingPlayer } = await supabaseAdmin
    .from('game_players')
    .select('id, status')
    .eq('pod_id', podId)
    .eq('agent_id', agent.id)
    .single();

  if (existingPlayer) {
    return errorResponse(`Already in pod (status: ${existingPlayer.status})`, 409);
  }

  // Check capacity
  const { count } = await supabaseAdmin
    .from('game_players')
    .select('id', { count: 'exact', head: true })
    .eq('pod_id', podId);

  if (count !== null && count >= MAX_PLAYERS) {
    return errorResponse(`Pod full (${MAX_PLAYERS}/${MAX_PLAYERS})`, 409);
  }

  // Check duplicate tx
  const { data: existingTx } = await supabaseAdmin
    .from('game_transactions')
    .select('id')
    .eq('tx_signature', tx_signature)
    .single();

  if (existingTx) {
    return errorResponse('Transaction already used', 409);
  }

  console.log('[JOIN] Inserting player:', agent.name);
  
  // Record player (agent_name stored in agents table, not here)
  const { data: player, error: playerError } = await supabaseAdmin
    .from('game_players')
    .insert({
      pod_id: podId,
      agent_id: agent.id,
      role: null,
      status: 'alive',
    })
    .select()
    .single();

  if (playerError) {
    console.error('[JOIN] Player insert error:', playerError);
    return errorResponse(`Failed to join: ${playerError.message}`, 500);
  }

  console.log('[JOIN] Player created:', player.id);

  // Record transaction
  const { data: transaction, error: txError } = await supabaseAdmin
    .from('game_transactions')
    .insert({
      pod_id: podId,
      agent_id: agent.id,
      tx_type: 'entry_fee',
      amount: pod.entry_fee,
      wallet_from: agent.wallet_pubkey,
      wallet_to: 'pending',
      tx_signature,
      tx_status: 'pending',
      reason: `Entry fee for Pod #${podId}`,
    })
    .select()
    .single();

  if (txError) {
    await supabaseAdmin.from('game_players').delete().eq('id', player.id);
    return errorResponse(`Failed to record transaction: ${txError.message}`, 500);
  }

  // Get player count
  const { count: currentCount } = await supabaseAdmin
    .from('game_players')
    .select('id', { count: 'exact', head: true })
    .eq('pod_id', podId);

  return NextResponse.json({
    success: true,
    message: 'Welcome to the pod!',
    player: { id: player.id, agent_id: agent.id, agent_name: agent.name, status: 'alive' },
    transaction: { id: transaction.id, tx_signature, amount: pod.entry_fee },
    pod_status: {
      player_count: currentCount ?? 0,
      min_players: MIN_PLAYERS,
      max_players: MAX_PLAYERS,
      ready_to_start: (currentCount ?? 0) >= MIN_PLAYERS,
    },
  }, { status: 201 });
}
