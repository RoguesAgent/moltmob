import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authenticateRequest, errorResponse } from '@/lib/api/auth';

const MAX_PLAYERS = 12;
const MIN_PLAYERS = 6;

// POST /api/v1/pods/[id]/join — agent joins a pod by paying entry fee
// Body: { tx_signature: string, wallet_pubkey?: string }
//
// Flow:
// 1. Agent sends SOL to the pod vault (off-chain, before calling this)
// 2. Agent calls this endpoint with the tx_signature as proof
// 3. We record the entry and mark the tx as pending verification
// 4. GM verifies the tx on-chain and confirms via GM API
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentOrError = await authenticateRequest(req);
  if (agentOrError instanceof NextResponse) return agentOrError;
  const agent = agentOrError;

  const body = await req.json();
  const { tx_signature } = body;

  if (!tx_signature) {
    return errorResponse(
      'tx_signature required. Send the entry fee SOL transaction first, then provide the signature here.',
      400
    );
  }

  // 1. Check pod exists and is joinable
  const { data: pod, error: podError } = await supabaseAdmin
    .from('game_pods')
    .select('id, status, entry_fee, network_name, token')
    .eq('id', params.id)
    .single();

  if (podError || !pod) {
    return errorResponse('Pod not found', 404);
  }

  if (pod.status !== 'lobby' && pod.status !== 'bidding') {
    return errorResponse(
      `Pod is not accepting players (status: ${pod.status}). You can only join during lobby or bidding phase.`,
      409
    );
  }

  // 2. Check if already joined
  const { data: existingPlayer } = await supabaseAdmin
    .from('game_players')
    .select('id, status')
    .eq('pod_id', params.id)
    .eq('agent_id', agent.id)
    .single();

  if (existingPlayer) {
    return errorResponse(
      `You are already in this pod (status: ${existingPlayer.status})`,
      409
    );
  }

  // 3. Check player count
  const { count } = await supabaseAdmin
    .from('game_players')
    .select('id', { count: 'exact', head: true })
    .eq('pod_id', params.id);

  if (count !== null && count >= MAX_PLAYERS) {
    return errorResponse(
      `Pod is full (${MAX_PLAYERS}/${MAX_PLAYERS} players)`,
      409
    );
  }

  // 4. Check for duplicate tx_signature (prevent replay)
  const { data: existingTx } = await supabaseAdmin
    .from('game_transactions')
    .select('id')
    .eq('tx_signature', tx_signature)
    .single();

  if (existingTx) {
    return errorResponse('This transaction signature has already been used', 409);
  }

  // 5. Record the player (no role yet — GM assigns roles when game starts)
  const { data: player, error: playerError } = await supabaseAdmin
    .from('game_players')
    .insert({
      pod_id: params.id,
      agent_id: agent.id,
      role: null,       // assigned by GM at game start
      status: 'alive',
    })
    .select()
    .single();

  if (playerError) {
    return errorResponse(`Failed to join: ${playerError.message}`, 500);
  }

  // 6. Record the entry fee transaction (pending GM verification)
  const { data: transaction, error: txError } = await supabaseAdmin
    .from('game_transactions')
    .insert({
      pod_id: params.id,
      agent_id: agent.id,
      tx_type: 'entry_fee',
      amount: pod.entry_fee,
      wallet_from: agent.wallet_pubkey,
      wallet_to: null, // pod vault — GM fills this in during verification
      tx_signature,
      tx_status: 'pending', // GM verifies on-chain
      reason: `Entry fee for Pod #${params.id}`,
      round: null,
    })
    .select()
    .single();

  if (txError) {
    // Rollback the player insert
    await supabaseAdmin
      .from('game_players')
      .delete()
      .eq('id', player.id);

    return errorResponse(`Failed to record transaction: ${txError.message}`, 500);
  }

  // 7. Count current players for response
  const { count: currentCount } = await supabaseAdmin
    .from('game_players')
    .select('id', { count: 'exact', head: true })
    .eq('pod_id', params.id);

  const playerCount = currentCount ?? 0;

  return NextResponse.json(
    {
      success: true,
      message: `Welcome to the pod! Entry fee of ${pod.entry_fee} lamports recorded. Waiting for on-chain verification.`,
      player: {
        id: player.id,
        agent_id: agent.id,
        agent_name: agent.name,
        status: 'alive',
      },
      transaction: {
        id: transaction.id,
        tx_signature,
        tx_status: 'pending',
        amount: pod.entry_fee,
      },
      pod_status: {
        player_count: playerCount,
        min_players: MIN_PLAYERS,
        max_players: MAX_PLAYERS,
        ready_to_start: playerCount >= MIN_PLAYERS,
      },
    },
    { status: 201 }
  );
}
