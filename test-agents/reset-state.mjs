#!/usr/bin/env node

/**
 * Reset agent game state while preserving identity
 * Clears: pod participation, vote history, social stats
 * Keeps: wallet, soul, registration, total stats
 *
 * Usage: node reset-state.mjs [agent-name|all]
 * Example: node reset-state.mjs TestAgentA
 *          node reset-state.mjs all
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const LOGO = `
╔════════════════════════════════════════════╗
║     🔄 MoltMob Agent State Reset 🔄        ║
╚════════════════════════════════════════════╝
`;

function resetAgentState(agentDir) {
  const statePath = join(agentDir, 'state.json');
  
  if (!existsSync(statePath)) {
    console.error(`   ❌ No state.json found`);
    return false;
  }
  
  const state = JSON.parse(readFileSync(statePath, 'utf-8'));
  const agentName = state.agent_name;
  const walletAddress = state.wallet_address;
  const agentId = state.agent_id;
  const registeredAt = state.registered_at;
  const totalGames = state.game_state?.total_games_played || 0;
  const totalWins = state.game_state?.total_games_won || 0;
  
  // Reset while preserving identity
  const newState = {
    agent_name: agentName,
    persona: state.persona,
    created_at: state.created_at,
    registered_at: registeredAt,
    wallet_address: walletAddress,
    agent_id: agentId,
    game_state: {
      current_pod_id: null,
      current_role: null,
      status: "idle",
      last_pod_end: null,
      total_games_played: totalGames,
      total_games_won: totalWins
    },
    vote_history: [],
    social_state: {
      last_post_time: state.social_state?.last_post_time,
      last_reply_time: state.social_state?.last_reply_time,
      posts_made: state.social_state?.posts_made || 0,
      comments_made: state.social_state?.comments_made || 0,
      reputation_score: state.social_state?.reputation_score || 0
    },
    encryption_keys: {
      game_pubkey: null,
      shared_secrets: {}
    },
    notes: [...(state.notes || []), `State reset: ${new Date().toISOString()}`]
  };
  
  writeFileSync(statePath, JSON.stringify(newState, null, 2));
  return true;
}

async function main() {
  console.log(LOGO);
  
  const target = process.argv[2] || 'all';
  const liveDir = join(process.cwd(), 'live-agents');
  
  if (!existsSync(liveDir)) {
    console.error('❌ No live-agents directory found');
    process.exit(1);
  }
  
  let agentDirs = [];
  
  if (target === 'all') {
    agentDirs = readdirSync(liveDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => join(liveDir, d.name));
  } else {
    const specificDir = join(liveDir, target);
    if (!existsSync(specificDir)) {
      console.error(`❌ Agent "${target}" not found`);
      process.exit(1);
    }
    agentDirs = [specificDir];
  }
  
  console.log(`Found ${agentDirs.length} agent(s)\n`);
  
  let resetCount = 0;
  for (const agentDir of agentDirs) {
    const name = agentDir.split('/').pop();
    process.stdout.write(`🔄 Resetting ${name}... `);
    
    if (resetAgentState(agentDir)) {
      console.log('✅');
      resetCount++;
    } else {
      console.log('❌');
    }
  }
  
  console.log(`\n✅ Reset ${resetCount} agent(s) successfully`);
  console.log('\nReset fields:');
  console.log('  • Current pod participation');
  console.log('  • Current role/status');
  console.log('  • Vote history (per-game)');
  console.log('  • Encryption keys');
  console.log('\nPreserved:');
  console.log('  • Wallet / identity');
  console.log('  • Total games played/won');
  console.log('  • Moltbook social history');
  console.log('  • Soul/persona');
}

main().catch(console.error);
