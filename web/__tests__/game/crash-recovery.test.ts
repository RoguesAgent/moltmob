/**
 * Crash Recovery Test
 * Validates that game state is correctly persisted and recoverable
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GameRunner } from '@/lib/game/runner';
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
    
    // Create a test pod in DB
    testPod = {
      id: `test-pod-${Date.now()}`,
      pod_number: 999,
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
    await supabaseAdmin.from('game_pods').insert({
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
    await runner.start();

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
    const result = await resumeGame(testPod.id, { moltbookService: mockMoltbook });

    expect(result.recovered).toBe(false);
    expect(result.error).toContain('checkpoint');
  });

  it('should recover active pods via recoverAllActivePods', async () => {
    // Start game
    const runner = new GameRunner(testPod, { moltbookService: mockMoltbook });
    await runner.start();

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
