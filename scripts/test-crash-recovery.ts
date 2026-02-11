/**
 * Manual Crash Recovery Test
 * 
 * Run with: npx ts-node scripts/test-crash-recovery.ts
 * 
 * Test flow:
 * 1. Create test pod
 * 2. Start game (creates checkpoint)
 * 3. Simulate crash (destroy runner reference)
 * 4. Resume from DB
 * 5. Verify state matches
 */

import { GameRunner } from '../web/lib/game/runner';
import { resumeGame, recoverAllActivePods } from '../web/lib/game/runner-resume';
import { MockMoltbookService } from '../web/lib/game/moltbook-service';
import { supabaseAdmin } from '../web/lib/supabase';
import type { Pod } from '../web/lib/game/types';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('🦞 MoltMob Crash Recovery Test\n');
  console.log('==============================\n');

  const mockMoltbook = new MockMoltbookService();
  const testPodId = `test-pod-${Date.now()}`;

  // Step 1: Create test pod
  console.log('Step 1: Creating test pod...');
  const testPod: Pod = {
    id: testPodId,
    pod_number: 9999,
    status: 'lobby',
    current_phase: 'lobby',
    current_round: 0,
    boil_meter: 0,
    entry_fee: 100_000_000,
    config: {
      network_name: 'solana',
      token: 'SOL',
      min_players: 4,
      max_players: 6,
    },
    players: [
      { id: 'agent-1', agent_name: 'TestAgent1', wallet_pubkey: 'wallet1', role: 'initiate', status: 'alive' },
      { id: 'agent-2', agent_name: 'TestAgent2', wallet_pubkey: 'wallet2', role: 'initiate', status: 'alive' },
      { id: 'agent-3', agent_name: 'TestAgent3', wallet_pubkey: 'wallet3', role: 'initiate', status: 'alive' },
      { id: 'agent-4', agent_name: 'TestAgent4', wallet_pubkey: 'wallet4', role: 'initiate', status: 'alive' },
    ],
    winner_side: null,
  };

  // Insert into Supabase
  const { error: podError } = await supabaseAdmin.from('game_pods').insert({
    id: testPod.id,
    pod_number: testPod.pod_number,
    status: testPod.status,
    current_phase: testPod.current_phase,
    current_round: testPod.current_round,
    boil_meter: testPod.boil_meter,
    entry_fee: testPod.entry_fee,
    network_name: testPod.config.network_name,
    token: testPod.config.token,
  });

  if (podError) {
    console.error('❌ Failed to create test pod:', podError);
    return;
  }

  for (const player of testPod.players) {
    await supabaseAdmin.from('game_players').insert({
      pod_id: testPod.id,
      agent_id: player.id,
      role: player.role,
      status: player.status,
    });
  }

  console.log('✅ Pod created:', testPodId);

  // Step 2: Start game
  console.log('\nStep 2: Starting game...');
  let runner: GameRunner | null = new GameRunner(testPod, { moltbookService: mockMoltbook });
  
  try {
    await runner.start();
    console.log('✅ Game started');
    console.log('   Status:', runner.getPod().status);
    console.log('   Phase:', runner.getPod().current_phase);
    console.log('   Round:', runner.getPod().current_round);
  } catch (err) {
    console.error('❌ Failed to start game:', err);
    return;
  }

  // Step 3: Simulate crash
  console.log('\nStep 3: Simulating GM crash...');
  runner = null; // Destroy reference
  console.log('✅ Runner destroyed');

  // Wait for checkpoint to be written
  await sleep(500);

  // Step 4: Recover from DB
  console.log('\nStep 4: Recovering from checkpoint...');
  const result = await resumeGame(testPodId, { moltbookService: mockMoltbook });

  if (!result.recovered) {
    console.error('❌ Recovery failed:', result.error);
    return;
  }

  console.log('✅ Game recovered');
  const recoveredPod = result.runner!.getPod();
  console.log('   Status:', recoveredPod.status);
  console.log('   Phase:', recoveredPod.current_phase);
  console.log('   Round:', recoveredPod.current_round);
  console.log('   Game Post ID:', result.gamePostId);

  // Step 5: Verify state
  console.log('\nStep 5: Verifying state...');
  const originalStatus = 'active';
  const originalPhase = 'night';
  const originalRound = 1;

  const checks = [
    recoveredPod.status === originalStatus,
    recoveredPod.current_phase === originalPhase,
    recoveredPod.current_round === originalRound,
  ];

  if (checks.every(Boolean)) {
    console.log('✅ All state checks passed!');
  } else {
    console.log('❌ State mismatch:');
    console.log('   Expected:', { status: originalStatus, phase: originalPhase, round: originalRound });
    console.log('   Got:', { status: recoveredPod.status, phase: recoveredPod.current_phase, round: recoveredPod.current_round });
  }

  // Step 6: Test recoverAllActivePods
  console.log('\nStep 6: Testing recoverAllActivePods...');
  const allResults = await recoverAllActivePods({ moltbookService: mockMoltbook });
  console.log('✅ Found', allResults.length, 'active pods');

  // Cleanup
  console.log('\nStep 7: Cleaning up...');
  await supabaseAdmin.from('gm_events').delete().eq('pod_id', testPodId);
  await supabaseAdmin.from('game_players').delete().eq('pod_id', testPodId);
  await supabaseAdmin.from('game_pods').delete().eq('id', testPodId);
  console.log('✅ Test data cleaned up');

  console.log('\n==============================');
  console.log('🎉 Crash recovery test complete!');
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
