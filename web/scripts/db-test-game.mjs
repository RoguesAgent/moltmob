#!/usr/bin/env node
/**
 * Database-backed test game for MoltMob
 * Creates a full game in Supabase that appears in the admin dashboard
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tecywteuhsuhsicdeuygznl.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY not set');
  console.error('Run: export SUPABASE_SERVICE_ROLE_KEY=your_key');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const botNames = [
  'TestAgentA', 'TestAgentB', 'TestAgentC', 'TestAgentD',
  'TestAgentE', 'TestAgentF', 'TestAgentG', 'TestAgentH',
  'TestAgentI', 'TestAgentJ', 'TestAgentK', 'TestAgentL'
];

async function createTestGame(playerCount = 8) {
  const now = new Date().toISOString();
  const podId = randomUUID();
  const podNumber = Math.floor(Math.random() * 9000) + 1000;

  console.log(`🎮 Creating test game with ${playerCount} players...`);

  // 1. Create pod
  const { data: pod, error: podError } = await supabase
    .from('game_pods')
    .insert({
      id: podId,
      pod_number: podNumber,
      status: 'completed',
      current_phase: 'ended',
      current_round: 4,
      boil_meter: 35,
      entry_fee: 100000000,
      min_players: 6,
      max_players: 12,
      network_name: 'solana-devnet',
      token: 'WSOL',
      winner_side: 'loyal',
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (podError) {
    console.error('Failed to create pod:', podError);
    return;
  }
  console.log(`✅ Created pod #${podNumber} (${podId})`);

  // 2. Create players/agents
  const players = [];
  const roles = ['clawboss', 'krill', 'krill'];
  // Fill remaining with loyalists
  for (let i = 3; i < playerCount; i++) {
    roles.push('loyalist');
  }

  // Shuffle roles
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }

  // Create agents first
  for (let i = 0; i < playerCount; i++) {
    const agentId = randomUUID();
    const { error: agentError } = await supabase
      .from('agents')
      .insert({
        id: agentId,
        name: botNames[i],
        wallet_pubkey: `wallet_${botNames[i].toLowerCase()}`,
        status: 'active',
        created_at: now,
      });

    if (agentError) {
      console.error(`Failed to create agent ${botNames[i]}:`, agentError);
      continue;
    }

    // Create player entry
    const isAlive = roles[i] !== 'clawboss'; // Clawboss eliminated
    const { data: player, error: playerError } = await supabase
      .from('game_players')
      .insert({
        id: randomUUID(),
        pod_id: podId,
        agent_id: agentId,
        role: roles[i],
        status: isAlive ? 'alive' : 'eliminated',
        eliminated_by: isAlive ? null : 'cooked',
        eliminated_round: isAlive ? null : 1,
        created_at: now,
      })
      .select()
      .single();

    if (playerError) {
      console.error(`Failed to create player ${botNames[i]}:`, playerError);
    } else {
      players.push({ name: botNames[i], role: roles[i], agent_id: agentId });
      console.log(`  👤 ${botNames[i]} → ${roles[i]} ${isAlive ? '✅' : '❌'}`);
    }
  }

  // 3. Create transactions for entry fees
  for (const player of players) {
    const { error: txError } = await supabase
      .from('game_transactions')
      .insert({
        id: randomUUID(),
        pod_id: podId,
        agent_id: player.agent_id,
        tx_type: 'entry_fee',
        amount: 100000000,
        wallet_from: `wallet_${player.name.toLowerCase()}`,
        wallet_to: 'gm_vault_wallet',
        tx_signature: `tx_${player.name.toLowerCase()}_${Date.now()}`,
        tx_status: 'confirmed',
        reason: `Entry fee for Pod #${podNumber}`,
        round: null,
        created_at: now,
      });

    if (txError) {
      console.error(`Failed to create transaction for ${player.name}:`, txError);
    }
  }
  console.log(`✅ Created ${playerCount} entry fee transactions`);

  // 4. Create votes for round 1
  const clawbossPlayer = players.find(p => p.role === 'clawboss');
  if (clawbossPlayer) {
    // Everyone votes for clawboss
    for (const player of players) {
      const { error: voteError } = await supabase
        .from('game_votes')
        .insert({
          id: randomUUID(),
          pod_id: podId,
          round: 1,
          voter_agent_id: player.agent_id,
          target_agent_id: clawbossPlayer.agent_id,
          created_at: now,
        });

      if (voteError) {
        console.error(`Failed to create vote from ${player.name}:`, voteError);
      }
    }
    console.log(`✅ Created votes (all targeting Clawboss)`);
  }

  // 5. Create game events
  const events = [
    { event_type: 'game_start', summary: `Pod #${podNumber} started with ${playerCount} players` },
    { event_type: 'role_assignment', summary: 'Roles assigned' },
    { event_type: 'vote', summary: `Clawboss (${clawbossPlayer?.name}) eliminated by vote`, round: 1 },
    { event_type: 'game_end', summary: 'Loyalists win! Clawboss eliminated.' },
  ];

  for (const evt of events) {
    const { error: evtError } = await supabase
      .from('game_events')
      .insert({
        id: randomUUID(),
        pod_id: podId,
        event_type: evt.event_type,
        round: evt.round || null,
        payload: { summary: evt.summary },
        created_at: now,
      });

    if (evtError) {
      console.error('Failed to create event:', evtError);
    }
  }
  console.log(`✅ Created ${events.length} game events`);

  // Summary
  console.log('\n📊 Game Summary:');
  console.log(`  Pod: #${podNumber} (${podId})`);
  console.log(`  Players: ${playerCount}`);
  console.log(`  Winner: Loyalists 🎉`);
  console.log(`  Pot: ${playerCount * 0.1} SOL`);
  console.log(`\n🔍 View in admin: https://www.moltmob.com/admin/games/${podId}`);
}

// Run with default 8 players
createTestGame(8).catch(console.error);
