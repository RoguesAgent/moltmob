import { describe, it, expect } from 'vitest';
import { startGame, processNight, processVote, createOrchestratorState, NightActionInput, VoteInput } from './orchestrator';
import { createPod, joinPod } from './lobby';
import { randomUUID } from 'crypto';

describe('Full Game Simulation', () => {
  it('runs a complete 6-player game with payments', () => {
    // Create pod with entry fee
    const pod = createPod({
      id: randomUUID(),
      pod_number: 8888,
      entry_fee: 1_000_000, // 0.001 SOL
      max_players: 6,
      config: {
        test_mode: true,
        mock_moltbook: true,
        max_rounds: 5,
      },
    });

    // Add 6 players (simulating paid entries)
    const players = [
      { name: 'CrabbyPatton', wallet: 'wallet_1' },
      { name: 'LobsterLord', wallet: 'wallet_2' },
      { name: 'ShrimpScampi', wallet: 'wallet_3' },
      { name: 'PrawnStar', wallet: 'wallet_4' },
      { name: 'CrawdadKing', wallet: 'wallet_5' },
      { name: 'BarnacleBot', wallet: 'wallet_6' },
    ];

    for (const p of players) {
      const result = joinPod(pod, {
        id: randomUUID(),
        agent_name: p.name,
        wallet_pubkey: p.wallet,
        encryption_pubkey: `enc_${p.wallet}`,
      });
      expect(result).toBeNull(); // No error
    }

    console.log('\n🦞 MOLTMOB TEST GAME');
    console.log('══════════════════════════════════════════════════');
    console.log(`Pod #${pod.pod_number} | Entry: ${pod.entry_fee / 1_000_000_000} SOL | Players: ${pod.players.length}`);
    console.log(`Total Pot: ${(pod.players.length * pod.entry_fee) / 1_000_000_000} SOL`);

    // Start game
    let transition = startGame(pod);
    let current = transition.pod;
    const state = createOrchestratorState(current);

    console.log('\n📋 ROLES ASSIGNED:');
    for (const p of current.players) {
      console.log(`   ${p.agent_name.padEnd(15)} → ${p.role?.toUpperCase()}`);
    }

    // Auto-play game
    let round = 0;
    const maxRounds = 10;

    while (current.status === 'active' && round < maxRounds) {
      round++;

      if (current.current_phase === 'night') {
        const alive = current.players.filter(p => p.status === 'alive');
        const actions: NightActionInput[] = alive.map(p => {
          if (p.role === 'clawboss') {
            const targets = alive.filter(t => t.id !== p.id && t.role !== 'clawboss');
            const target = targets[Math.floor(Math.random() * targets.length)];
            return { player_id: p.id, action: 'pinch', target_id: target?.id ?? null };
          }
          return { player_id: p.id, action: 'scuttle', target_id: null };
        });

        transition = processNight(current, actions, state);
        current = transition.pod;

        console.log(`\n🌙 NIGHT ${current.current_round}:`);
        for (const e of transition.events) {
          console.log(`   ${e.summary}`);
        }
      }

      if (current.current_phase === 'day') {
        current.current_phase = 'vote';
      }

      if (current.current_phase === 'vote') {
        const alive = current.players.filter(p => p.status === 'alive');
        const votes: VoteInput[] = alive.map(p => {
          const others = alive.filter(o => o.id !== p.id);
          const target = others[Math.floor(Math.random() * others.length)];
          return { voter_id: p.id, target_id: target?.id ?? null };
        });

        transition = processVote(current, votes, state);
        current = transition.pod;

        console.log(`\n🗳️  VOTE ${current.current_round}:`);
        for (const e of transition.events) {
          console.log(`   ${e.summary}`);
        }
        console.log(`   Boil Meter: ${current.boil_meter}%`);
      }

      if (transition.winResult?.game_over) break;
    }

    // Final results
    console.log('\n══════════════════════════════════════════════════');
    console.log('🏆 GAME OVER');
    console.log('══════════════════════════════════════════════════');
    console.log(`Winner Side: ${current.winner_side?.toUpperCase() ?? 'NONE'}`);
    console.log(`Final Phase: ${current.current_phase}`);
    console.log(`Rounds Played: ${current.current_round}`);

    console.log('\n✅ SURVIVORS:');
    for (const p of current.players.filter(p => p.status === 'alive')) {
      console.log(`   ${p.agent_name} (${p.role})`);
    }

    console.log('\n❌ ELIMINATED:');
    for (const p of current.players.filter(p => p.status === 'eliminated')) {
      console.log(`   ${p.agent_name} (${p.role}) — ${p.eliminated_by} R${p.eliminated_round}`);
    }

    if (transition.payouts?.length) {
      console.log('\n💰 PAYOUTS:');
      for (const pay of transition.payouts) {
        const player = current.players.find(p => p.id === pay.player_id);
        console.log(`   ${player?.agent_name}: ${pay.amount / 1_000_000_000} SOL (${pay.reason})`);
      }
    }

    expect(current.status).toBe('completed');
    expect(current.winner_side).toBeDefined();
  });
});
