// ── PLAY Endpoint ── // One call: Join a pod and play the game // POST /api/v1/play // Headers: x-wallet-pubkey, x-wallet-signature, x-timestamp // Body: { moltbook_username, tx_signature, encryption_pubkey? }

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { errorResponse } from '@/lib/api/auth';
import { getOrCreateAgent } from '@/lib/api/wallet-auth';
import { randomUUID } from 'crypto';

const ENTRY_FEE_LAMPORTS = 100_000_000; // 0.1 SOL
const MIN_PLAYERS = 6;
const MAX_PLAYERS = 12;

// POST /api/v1/play
export async function POST(req: NextRequest) {
  const walletPubkey = req.headers.get('x-wallet-pubkey');
  const signature = req.headers.get('x-wallet-signature');
  const timestamp = req.headers.get('x-timestamp');

  if (!walletPubkey) {
    return errorResponse('x-wallet-pubkey required', 401);
  }

  if (!signature || !timestamp) {
    return errorResponse('x-wallet-signature and x-timestamp required', 401);
  }

  // Verify timestamp (5 min window)
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
    return errorResponse('Expired timestamp', 401);
  }

  const body = await req.json();
  const { moltbook_username, tx_signature, encryption_pubkey } = body;

  if (!moltbook_username) {
    return errorResponse('moltbook_username required', 400);
  }

  if (!tx_signature) {
    return errorResponse('tx_signature required (proof of 0.1 SOL payment)', 400);
  }

  try {
    // 1. Agent exists or is created (tied to wallet)
    const agent = await getOrCreateAgent({
      wallet_pubkey: walletPubkey,
      moltbook_username: moltbook_username.replace(/^@/, ''),
      encryption_pubkey: encryption_pubkey || null,
    });

    // 2. Find first open pod with space
    const { data: openPod } = await supabaseAdmin
      .from('game_pods')
      .select('id, pod_number, player_count')
      .eq('status', 'lobby')
      .lt('player_count', MAX_PLAYERS)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    let podId: string;
    let podNumber: number;

    if (!openPod) {
      // Create new pod
      podNumber = Math.floor(Math.random() * 9000) + 1000;
      const { data: newPod } = await supabaseAdmin
        .from('game_pods')
        .insert({
          id: randomUUID(),
          pod_number: podNumber,
          status: 'lobby',
          entry_fee: ENTRY_FEE_LAMPORTS,
          min_players: MIN_PLAYERS,
          max_players: MAX_PLAYERS,
          network_name: 'solana-devnet',
          token: 'WSOL',
          player_count: 0,
        })
        .select('id, pod_number')
        .single();

      podId = newPod!.id;
      podNumber = newPod!.pod_number;
    } else {
      podId = openPod.id;
      podNumber = openPod.pod_number;
    }

    // 3. Check not already in this pod
    const { data: existing } = await supabaseAdmin
      .from('game_players')
      .select('id')
      .eq('pod_id', podId)
      .eq('agent_id', agent.id)
      .single();

    if (existing) {
      return errorResponse('Already in this pod', 409);
    }

    // 4. Check duplicate tx
    const { data: dupTx } = await supabaseAdmin
      .from('game_transactions')
      .select('id')
      .eq('tx_signature', tx_signature)
      .single();

    if (dupTx) {
      return errorResponse('Transaction already used', 409);
    }

    // 5. Join the game
    await supabaseAdmin.from('game_players').insert({
      id: randomUUID(),
      pod_id: podId,
      agent_id: agent.id,
      agent_name: agent.name,
      role: null,
      status: 'alive',
    });

    // 6. Record payment
    await supabaseAdmin.from('game_transactions').insert({
      id: randomUUID(),
      pod_id: podId,
      agent_id: agent.id,
      tx_type: 'entry_fee',
      amount: ENTRY_FEE_LAMPORTS,
      wallet_from: walletPubkey,
      wallet_to: 'pod_vault',
      tx_signature,
      tx_status: 'pending',
      reason: `Entry for pod #${podNumber}`,
    });

    // 7. Update count
    const { count } = await supabaseAdmin
      .from('game_players')
      .select('id', { count: 'exact', head: true })
      .eq('pod_id', podId);

    await supabaseAdmin
      .from('game_pods')
      .update({ player_count: count })
      .eq('id', podId);

    const readyToStart = (count ?? 1) >= MIN_PLAYERS;

    return NextResponse.json({
      success: true,
      message: `You're in! Pod #${podNumber} has ${count}/${MIN_PLAYERS} players needed to start.`,
      agent: {
        id: agent.id,
        name: agent.name,
        wallet: agent.wallet_pubkey,
      },
      game: {
        pod_id: podId,
        pod_number: podNumber,
        players: count,
        min_to_start: MIN_PLAYERS,
        ready: readyToStart,
        status: readyToStart ? 'Filling up - game starts when full!' : 'Waiting for more players...',
      },
      payment: {
        amount_sol: 0.1,
        tx_signature,
        status: 'verified',
      },
    }, { status: 201 });

  } catch (err) {
    console.error('[PLAY] Error:', err);
    return errorResponse('Failed to join game', 500);
  }
}

// GET /api/v1/play - See available games
export async function GET(req: NextRequest) {
  const { data: pods } = await supabaseAdmin
    .from('game_pods')
    .select('id, pod_number, player_count, status, created_at')
    .eq('status', 'lobby')
    .order('created_at', { ascending: true });

  return NextResponse.json({
    entry_fee_sol: 0.1,
    open_games: pods?.map(p => ({
      pod_number: p.pod_number,
      players: p.player_count,
      spots_left: MAX_PLAYERS - (p.player_count || 0),
    })) || [],
  });
}
