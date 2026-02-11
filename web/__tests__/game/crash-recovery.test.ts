/**
 * Crash Recovery Test
 * Validates that game state is correctly persisted and recoverable
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GameRunner, enableCheckpointPersistence } from '@/lib/game/runner';
import { resumeGame, recoverAllActivePods } from '@/lib/game/runner-resume';
import { MockMoltbookService } from '@/lib/game/moltbook-service';
import { supabaseAdmin } from '@/lib/supabase';
import type { Pod } from '@/lib/game/types';

describe('Crash Recovery', () => {
  let mockMoltbook: MockMoltbookService;
  let testPod: Pod;
  const config = { moltbookService: mockMoltbook };

  beforeEach(async () => {
    mockMoltbook = new MockMoltbookService();
    
    // Create a test pod in DB with correct Pod structure
    testPod = {
      id: `test-pod-${Date.now()}`,
      pod_number: 999,
      status: 'lobby',
      current_phase: 'lobby',
      current_round: 0,
      boil_meter: 0,
      entry_fee: 100_000_000,
      min_players: 6,
      max_players: 12,
      network: 'solana-devnet',
      winner_side: null,
      lobby_deadline: Date.now() + 24 * 60 * 60 * 1000,
      config: {
        network_name: 'solana-devnet',
        token: 'WSOL',
        test_mode: true,
        mock_moltbook: true,
        max_rounds: 10,
        rake_percent: 10,
        lobby_timeout_ms: 300_000,
      },
      players: [
        { id: 'agent-1', agent_name: 'TestAgent1', wallet_pubkey: 'wallet1', encryption_pubkey: 'enc1', role: 'initiate', status: 'alive', eliminated_by: null, eliminated_round: null },
        { id: 'agent-2', agent_name: 'TestAgent2', wallet_pubkey: 'wallet2', encryption_pubkey: 'enc2', role: 'initiate', status: 'alive', eliminated_by: null, eliminated_round: null },
        { id: 'agent-3', agent_name: 'TestAgent3', wallet_pubkey: 'wallet3', encryption_pubkey: 'enc3', role: 'initiate', status: 'alive', eliminated_by: null, eliminated_round: null },
        { id: 'agent-4', agent_name: 'TestAgent4', wallet_pubkey: 'wallet4', encryption_pubkey: 'enc4', role: 'initiate', status: 'alive', eliminated_by: null, eliminated_round: null },
        { id: 'agent-5', agent_name: 'TestAgent5', wallet_pubkey: 'wallet5', encryption_pubkey: 'enc5', role: 'initiate', status: 'alive', eliminated_by: null, eliminated_round: null },
        { id: 'agent-6', agent_name: 'TestAgent6', wallet_pubkey: 'wallet6', encryption_pubkey: 'enc6', role: 'initiate', status: 'alive', eliminated_by: null, eliminated_round: null },
      ],
    };

    // Insert into Supabase
    await supabaseAdmin.from('game_pods').insert({
      id: testPod.id,
      pod_number: testPod.pod_number,
      status: testPod.status,
      current_phase: testPod.current_phase,
      current_round: testPod.current_round,
      boil_meter: testPod.boil_meter,
      entry_fee: testPod.entry_fee,
      min_players: testPod.min_players,
      max_players: testPod.max_players,
      network_name: testPod.config.network_name,
      token: testPod.config.token,
      lobby_deadline: testPod.lobby_deadline,
    });

    for (const player of testPod.players) {
      await supabaseAdmin.from('game_players').insert({
        pod_id: testPod.id,
        agent_id: player.id,
        role: player.role,
        status: player.status,
      });
    }
  });

  afterEach(async () => {
    // Clean up test data
    await supabaseAdmin.from('gm_events').delete().eq('pod_id', testPod.id);
    await supabaseAdmin.from('game_transactions').delete().eq('pod_id', testPod.id);
    await supabaseAdmin.from('game_players').delete().eq('pod_id', testPod.id);
    await supabaseAdmin.from('game_pods').delete().eq('id', testPod.id);
  });

  it('should create a checkpoint after starting game', async () => {
    const runner = new GameRunner(testPod, { moltbookService: mockMoltbook });
    enableCheckpointPersistence(runner);
    const transition = await runner.start();

    expect(transition.pod.status).toBe('active');
    expect(transition.pod.current_phase).toBe('night');

    // Check checkpoint was created
    const { data: checkpoints } = await supabaseAdmin
      .from('gm_events')
      .select('*')
      .eq('pod_id', testPod.id)
      .eq('event_type', 'orchestrator_checkpoint');

    expect(checkpoints?.length).toBeGreaterThan(0);
    expect(checkpoints![0].details.orchestrator_state).toBeDefined();
  });

  it('should recover game from checkpoint', async () => {
    // Start game
    const runner = new GameRunner(testPod, { moltbookService: mockMoltbook });
    enableCheckpointPersistence(runner);
    await runner.start();

    // Wait for checkpoint to be written
    await new Promise(resolve => setTimeout(resolve, 500));

    // Simulate crash: create new runner with same pod ID
    const result = await resumeGame(testPod.id, { moltbookService: mockMoltbook });

    expect(result.recovered).toBe(true);
    expect(result.runner).not.toBeNull();
    expect(result.state).not.toBeNull();
    
    // Verify state matches
    const recoveredPod = result.runner!.getPod();
    expect(recoveredPod.status).toBe('active');
    expect(recoveredPod.current_phase).toBe('night');
    expect(recoveredPod.current_round).toBe(1);
  });

  it('should return recoverable=false if no checkpoint exists', async () => {
    // Don't start the game, so no checkpoint exists
    const result = await resumeGame(testPod.id, { moltbookService: mockMoltbook });

    expect(result.recovered).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should recover active pods via recoverAllActivePods', async () => {
    // Start game
    const runner = new GameRunner(testPod, { moltbookService: mockMoltbook });
    enableCheckpointPersistence(runner);
    await runner.start();

    // Wait for checkpoint to be written
    await new Promise(resolve => setTimeout(resolve, 500));

    // Update pod status to active
    await supabaseAdmin
      .from('game_pods')
      .update({ status: 'active' })
      .eq('id', testPod.id);

    // Recover all active pods
    const results = await recoverAllActivePods({ moltbookService: mockMoltbook });

    expect(results.length).toBeGreaterThan(0);
    const ourPodResult = results.find(r => r.runner?.getPod().id === testPod.id);
    expect(ourPodResult?.recovered).toBe(true);
  });
});
