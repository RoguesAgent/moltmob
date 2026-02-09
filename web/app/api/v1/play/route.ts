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

    // Step 1: Check for duplicate tx
    const { data: dupTx, error: dupTxError } = await supabaseAdmin
      .from('game_transactions')
      .select('id')
      .eq('tx_signature', txSignature)
      .single();
    
    if (dupTxError && dupTxError.code !== 'PGRST116') {
      console.error('[PLAY] Step 1 - dup tx check error:', dupTxError);
      throw new Error('Step 1: txn check failed: ' + dupTxError.message);
    }
    
    if (dupTx) {
      return errorResponse('Transaction already used', 409);
    }

    // Step 2: Get or create agent
    let agent;
    try {
      agent = await getOrCreateAgent({
        wallet_pubkey: walletPubkey,
        moltbook_username: expectedMemo,
        encryption_pubkey: encryption_pubkey || null,
      });
    } catch (agentErr) {
      console.error('[PLAY] Step 2 - agent creation error:', agentErr);
      throw new Error('Step 2: agent creation failed: ' + (agentErr instanceof Error ? agentErr.message : 'unknown'));
    }

    // Step 3: Find or create pod
    let podId: string;
    let podNumber: number;
    
    // Get all lobby pods and count players manually (player_count column doesn't exist)
    const { data: lobbyPods, error: podError } = await supabaseAdmin
      .from('game_pods')
      .select('id, pod_number')
      .eq('status', 'lobby')
      .order('created_at', { ascending: true });
    
    if (podError) {
      console.error('[PLAY] Step 3 - pod fetch error:', podError);
      throw new Error('Step 3: pod fetch failed: ' + podError.message);
    }

    // Find pod with space by counting players
    let openPod: { id: string; pod_number: number } | null = null;
    if (lobbyPods && lobbyPods.length > 0) {
      for (const pod of lobbyPods) {
        const { count } = await supabaseAdmin
          .from('game_players')
          .select('id', { count: 'exact', head: true })
          .eq('pod_id', pod.id);
        
        if (count !== null && count < MAX_PLAYERS) {
          openPod = pod;
          break;
        }
      }
    }

    if (!openPod) {
      podNumber = Math.floor(Math.random() * 9000) + 1000;
      const { data: newPod, error: createPodError } = await supabaseAdmin
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
        })
        .select('id, pod_number')
        .single();
      
      if (createPodError || !newPod) {
        console.error('[PLAY] Step 3b - pod creation error:', createPodError);
        throw new Error('Step 3b: pod creation failed: ' + (createPodError?.message || 'no data'));
      }
      
      podId = newPod.id;
      podNumber = newPod.pod_number;
    } else {
      podId = openPod.id;
      podNumber = openPod.pod_number;
    }

    // Step 4: Check not already in pod
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('game_players')
      .select('id')
      .eq('pod_id', podId)
      .eq('agent_id', agent.id)
      .single();
    
    if (existingError && existingError.code !== 'PGRST116') {
      console.error('[PLAY] Step 4 - existing check error:', existingError);
      throw new Error('Step 4: existing check failed: ' + existingError.message);
    }
    
    if (existing) {
      return errorResponse('Already in this pod', 409);
    }

    // Step 5: Join the game
    const { error: joinError } = await supabaseAdmin.from('game_players').insert({
      id: randomUUID(),
      pod_id: podId,
      agent_id: agent.id,
      agent_name: agent.name,
      wallet_pubkey: walletPubkey,
      role: null,
      status: 'alive',
    });
    
    if (joinError) {
      console.error('[PLAY] Step 5 - join error:', joinError);
      throw new Error('Step 5: join failed: ' + joinError.message);
    }

    // Step 6: Record payment
    const { error: txError } = await supabaseAdmin.from('game_transactions').insert({
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
    
    if (txError) {
      console.error('[PLAY] Step 6 - txn error:', txError);
      throw new Error('Step 6: txn record failed: ' + txError.message);
    }

    // Step 7: Get player count
    const { count, error: countError } = await supabaseAdmin
      .from('game_players')
      .select('id', { count: 'exact', head: true })
      .eq('pod_id', podId);
    
    if (countError) {
      console.error('[PLAY] Step 7 - count error:', countError);
      throw new Error('Step 7: count failed: ' + countError.message);
    }

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
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[PLAY] Full error:', err);
    return errorResponse(errorMsg, 500);
  }
}
