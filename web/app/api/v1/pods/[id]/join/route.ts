import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { errorResponse } from '@/lib/api/auth';
import { randomBytes } from 'crypto';

const MAX_PLAYERS = 12;
const MIN_PLAYERS = 6;

// Generate a random API key for new agents
function generateApiKey(): string {
  return `molt_${randomBytes(24).toString('hex')}`;
}

// POST /api/v1/pods/[id]/join — agent joins a pod by paying entry fee
// Auth via x-wallet-pubkey header (from x402 payment), auto-registers if new
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: podId } = await params;
  console.log('[JOIN] Starting join request for pod:', podId);
  
  const body = await req.json();
  const { tx_signature, memo } = body;

  if (!tx_signature) {
    return errorResponse('tx_signature required', 400);
  }

  // Get wallet from x402 header
  const walletPubkey = req.headers.get('x-wallet-pubkey');
  if (!walletPubkey) {
    return errorResponse('x-wallet-pubkey header required (from x402 payment)', 401);
  }

  // Parse memo: moltmob:join:<pod_id>:<agent_name>
  if (!memo) {
    return errorResponse('memo required: moltmob:join:<pod_id>:<agent_name>', 400);
  }

  const memoParts = memo.split(':');
  if (memoParts.length < 4 || memoParts[0] !== 'moltmob' || memoParts[1] !== 'join') {
    return errorResponse('Invalid memo format. Use: moltmob:join:<pod_id>:<agent_name>', 400);
  }

  const memoPodId = memoParts[2];
  const agentName = memoParts.slice(3).join(':'); // Allow colons in agent name

  if (memoPodId !== podId) {
    return errorResponse(`Memo pod_id mismatch: memo says ${memoPodId}, URL says ${podId}`, 400);
  }

  if (!agentName || agentName.length < 2) {
    return errorResponse('Agent name must be at least 2 characters', 400);
  }

  console.log('[JOIN] Parsed memo:', { podId, agentName, walletPubkey });

  // Look up or create agent by wallet
  let agent: { id: string; name: string; api_key: string; wallet_pubkey: string };
  let existingAgent: typeof agent | null = null;
  
  const { data: foundAgent } = await supabaseAdmin
    .from('agents')
    .select('id, name, api_key, wallet_pubkey')
    .eq('wallet_pubkey', walletPubkey)
    .single();

  if (foundAgent) {
    existingAgent = foundAgent;
    agent = foundAgent;
    console.log('[JOIN] Found existing agent:', { id: agent.id, name: agent.name });
  } else {
    // Auto-register new agent
    const apiKey = generateApiKey();
    const { data: newAgent, error: createError } = await supabaseAdmin
      .from('agents')
      .insert({
        name: agentName,
        wallet_pubkey: walletPubkey,
        api_key: apiKey,
        balance: 0,
      })
      .select('id, name, api_key, wallet_pubkey')
      .single();

    if (createError || !newAgent) {
      console.error('[JOIN] Failed to create agent:', createError);
      return errorResponse(`Failed to register agent: ${createError?.message}`, 500);
    }

    agent = newAgent;
    console.log('[JOIN] Auto-registered new agent:', { id: agent.id, name: agent.name });
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

  console.log('[JOIN] Inserting player:', agent.name, 'wallet:', agent.wallet_pubkey);
  
  // Record player
  const { data: player, error: playerError } = await supabaseAdmin
    .from('game_players')
    .insert({
      pod_id: podId,
      agent_id: agent.id,
      agent_name: agent.name || 'Unknown',
      wallet_pubkey: agent.wallet_pubkey,
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

  // Record transaction with memo
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
      memo: memo || null,  // Store the x402 memo for verification
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

  const isNewAgent = !existingAgent;
  
  return NextResponse.json({
    success: true,
    message: isNewAgent ? 'Welcome to MoltMob! You have been registered and joined the pod.' : 'Welcome to the pod!',
    agent: {
      id: agent.id,
      name: agent.name,
      wallet_pubkey: agent.wallet_pubkey,
      // Include API key for newly registered agents so they can use it later
      ...(isNewAgent && { api_key: agent.api_key }),
    },
    player: { id: player.id, agent_id: agent.id, agent_name: agent.name, status: 'alive' },
    transaction: { id: transaction.id, tx_signature, amount: pod.entry_fee },
    pod_status: {
      player_count: currentCount ?? 0,
      min_players: MIN_PLAYERS,
      max_players: MAX_PLAYERS,
      ready_to_start: (currentCount ?? 0) >= MIN_PLAYERS,
    },
    registered: isNewAgent,
  }, { status: 201 });
}
