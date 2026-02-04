import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireGmAuth } from '@/lib/api/gm-auth';
import { createPod, joinPod } from '@/lib/game/lobby';
import { randomUUID } from 'crypto';

// POST /api/test/pod — create a test pod with optional bot players
// Body: { player_count?: number, entry_fee?: number, auto_start?: boolean }
export async function POST(req: NextRequest) {
  const authError = requireGmAuth(req);
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const playerCount = body.player_count ?? 8;
  const entryFee = body.entry_fee ?? 10_000_000;

  // Create pod
  const pod = createPod({
    id: randomUUID(),
    pod_number: Math.floor(Math.random() * 9000) + 1000,
    entry_fee: entryFee,
    config: {
      test_mode: true,
      mock_moltbook: true,
      lobby_timeout_ms: 600_000, // 10 min for tests
    },
  });

  // Add bot players
  const botNames = [
    'CrabbyPatton', 'LobsterLord', 'ShrimpScampi', 'PrawnStar',
    'CrawdadKing', 'BarnacleBot', 'CoralCrusher', 'TidePoolTom',
    'HermitHacker', 'KelpKnight', 'ReefRunner', 'SquidSquad',
  ];

  const bots = [];
  for (let i = 0; i < Math.min(playerCount, 12); i++) {
    const botId = randomUUID();
    const botName = `${botNames[i]}_${Math.floor(Math.random() * 1000)}`;

    // Ensure agent exists in DB
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .upsert({
        id: botId,
        name: botName,
        api_key: `test_${randomUUID()}`,
        wallet_pubkey: `test_wallet_${botId.slice(0, 8)}`,
      }, { onConflict: 'id' })
      .select()
      .single();

    const error = joinPod(pod, {
      id: botId,
      agent_name: botName,
      wallet_pubkey: `test_wallet_${botId.slice(0, 8)}`,
      encryption_pubkey: `test_enc_${botId.slice(0, 8)}`,
    });

    if (!error) {
      bots.push({ id: botId, name: botName });
    }
  }

  // Save pod to DB
  await supabaseAdmin
    .from('game_pods')
    .insert({
      id: pod.id,
      pod_number: pod.pod_number,
      status: pod.status,
      current_phase: pod.current_phase,
      current_round: pod.current_round,
      boil_meter: pod.boil_meter,
      entry_fee: pod.entry_fee,
      network_name: pod.config.network_name,
      token: pod.config.token,
    });

  // Save players to DB
  for (const player of pod.players) {
    await supabaseAdmin
      .from('game_players')
      .insert({
        pod_id: pod.id,
        agent_id: player.id,
        role: null,
        status: 'alive',
      });
  }

  return NextResponse.json({
    pod: {
      id: pod.id,
      pod_number: pod.pod_number,
      status: pod.status,
      player_count: pod.players.length,
      entry_fee: pod.entry_fee,
    },
    bots,
    message: `Test pod #${pod.pod_number} created with ${bots.length} bot players`,
  }, { status: 201 });
}
