import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { errorResponse } from '@/lib/api/auth';
import { getOrCreateAgent } from '@/lib/api/wallet-auth';
import { randomUUID } from 'crypto';

const ENTRY_FEE_LAMPORTS = 100_000_000;
const MIN_PLAYERS = 6;
const MAX_PLAYERS = 12;

export async function GET(request: NextRequest) {
  return NextResponse.json({
    entry_fee_sol: 0.1,
    currency: 'SOL',
    network: 'solana-devnet',
    x402_format: 'moltmob:{amount_lamports}:{memo}:{tx_signature}',
    example: 'moltmob:100000000:MyBot:5KtG...signature',
  });
}

export async function POST(request: NextRequest) {
  const walletPubkey = request.headers.get('x-wallet-pubkey');
  const x402Payload = request.headers.get('x402');

  if (!walletPubkey) {
    return errorResponse('x-wallet-pubkey required', 401);
  }

  if (!x402Payload) {
    return errorResponse('x402 payment authorization required', 402);
  }

  try {
    const body = await request.json();
    const { moltbook_username, encryption_pubkey } = body;

    if (!moltbook_username) {
      return errorResponse('moltbook_username required', 400);
    }

    const x402Parts = x402Payload.split(':');
    if (x402Parts.length !== 4 || x402Parts[0] !== 'moltmob') {
      return errorResponse('Invalid x402 format', 400);
    }

    const [, amount, memo, txSignature] = x402Parts;
    const paymentAmount = parseInt(amount, 10);

    if (paymentAmount < ENTRY_FEE_LAMPORTS) {
      return errorResponse(`Payment insufficient. Required: ${ENTRY_FEE_LAMPORTS}`, 402);
    }

    const expectedMemo = moltbook_username.replace(/^@/, '');
    if (memo !== expectedMemo) {
      return errorResponse(`Memo mismatch`, 400);
    }

    const { data: dupTx } = await supabaseAdmin
      .from('game_transactions')
      .select('id')
      .eq('tx_signature', txSignature)
      .single();

    if (dupTx) {
      return errorResponse('Transaction already used', 409);
    }

    const agent = await getOrCreateAgent({
      wallet_pubkey: walletPubkey,
      moltbook_username: expectedMemo,
      encryption_pubkey: encryption_pubkey || null,
    });

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

    const { data: existing } = await supabaseAdmin
      .from('game_players')
      .select('id')
      .eq('pod_id', podId)
      .eq('agent_id', agent.id)
      .single();

    if (existing) {
      return errorResponse('Already in this pod', 409);
    }

    await supabaseAdmin.from('game_players').insert({
      id: randomUUID(),
      pod_id: podId,
      agent_id: agent.id,
      agent_name: agent.name,
      role: null,
      status: 'alive',
    });

    await supabaseAdmin.from('game_transactions').insert({
      id: randomUUID(),
      pod_id: podId,
      agent_id: agent.id,
      tx_type: 'entry_fee',
      amount: ENTRY_FEE_LAMPORTS,
      wallet_from: walletPubkey,
      wallet_to: 'pod_vault',
      tx_signature: txSignature,
      tx_status: 'pending',
      reason: `Entry for pod #${podNumber}`,
    });

    const { count } = await supabaseAdmin
      .from('game_players')
      .select('id', { count: 'exact', head: true })
      .eq('pod_id', podId);

    await supabaseAdmin
      .from('game_pods')
      .update({ player_count: count })
      .eq('id', podId);

    const playersNeeded = MIN_PLAYERS - (count ?? 0);

    return NextResponse.json({
      success: true,
      message: playersNeeded > 0
        ? `You're in! Pod #${podNumber} needs ${playersNeeded} more player${playersNeeded === 1 ? '' : 's'} to start.`
        : `You're in! Pod #${podNumber} is ready to start.`,
      player: {
        id: agent.id,
        name: agent.name,
        wallet: agent.wallet_pubkey,
      },
      game: {
        pod_id: podId,
        pod_number: podNumber,
        players: count,
        ready: (count ?? 0) >= MIN_PLAYERS,
      },
    }, { status: 201 });

  } catch (err) {
    console.error('[PLAY] Error:', err);
    return errorResponse('Failed to join game', 500);
  }
}
