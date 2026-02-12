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

// Generate a random UUID
function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

describe('Crash Recovery', () => {
  let mockMoltbook: MockMoltbookService;
  let testPod: Pod;
  let testPodId: string;
  let testAgentIds: string[];

  beforeEach(async () => {
    mockMoltbook = new MockMoltbookService();
    
    // Generate proper UUIDs
    testPodId = randomUUID();
    testAgentIds = Array.from({ length: 6 }, () => randomUUID());
    
    // Create test agents first (required by foreign key)
    for (let i = 0; i < testAgentIds.length; i++) {
      const { error: agentError } = await supabaseAdmin.from('agents').upsert({
        id: testAgentIds[i],
        name: `TestAgent${Date.now()}_${i}`, // Unique name
        api_key: `test-api-key-${testAgentIds[i]}`, // Required field
        wallet_pubkey: `wallet${i + 1}`,
      }, { onConflict: 'id' });
      
      if (agentError) {
        console.error('Failed to insert test agent:', agentError);
      }
    }

    // Create a test pod in DB with correct Pod structure
    testPod = {
      id: testPodId,
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
      players: testAgentIds.map((id, i) => ({
        id,
        agent_name: `TestAgent${i + 1}`,
        wallet_pubkey: `wallet${i + 1}`,
        encryption_pubkey: `enc${i + 1}`,
        role: 'initiate' as const,
        status: 'alive' as const,
        eliminated_by: null,
        eliminated_round: null,
      })),
    };

    // Insert pod into Supabase
    const { error: podError } = await supabaseAdmin.from('game_pods').insert({
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
    });
    
    if (podError) {
      console.error('Failed to insert test pod:', podError);
    }

    // Insert players
    for (const player of testPod.players) {
      const { error: playerError } = await supabaseAdmin.from('game_players').insert({
        pod_id: testPod.id,
        agent_id: player.id,
        agent_name: player.agent_name,
        wallet_pubkey: player.wallet_pubkey,
        encryption_pubkey: player.encryption_pubkey,
        role: player.role,
        status: player.status,
      });
      
      if (playerError) {
        console.error('Failed to insert test player:', playerError);
      }
    }
  });

  afterEach(async () => {
    // Clean up test data (order matters due to foreign keys)
    await supabaseAdmin.from('gm_events').delete().eq('pod_id', testPod.id);
    await supabaseAdmin.from('game_transactions').delete().eq('pod_id', testPod.id);
    await supabaseAdmin.from('game_players').delete().eq('pod_id', testPod.id);
    await supabaseAdmin.from('game_pods').delete().eq('id', testPod.id);
    
    // Clean up test agents
    for (const agentId of testAgentIds) {
      await supabaseAdmin.from('agents').delete().eq('id', agentId);
    }
  });

  it('should create a checkpoint after starting game', async () => {
    const runner = new GameRunner(testPod, { moltbookService: mockMoltbook });
    enableCheckpointPersistence(runner);
    const transition = await runner.start();

    expect(transition.pod.status).toBe('active');
    expect(transition.pod.current_phase).toBe('night');

    // Wait for checkpoint to be written (async)
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check checkpoint was created
    const { data: checkpoints, error } = await supabaseAdmin
      .from('gm_events')
      .select('*')
      .eq('pod_id', testPod.id)
      .eq('event_type', 'orchestrator_checkpoint');

    if (error) {
      console.error('Checkpoint query error:', error);
    }

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

    // Log error for debugging
    if (!result.recovered) {
      console.error('Recovery failed:', result.error);
    }

    expect(result.recovered).toBe(true);
    expect(result.runner).not.toBeNull();
    expect(result.state).not.toBeNull();
    
    // Verify state matches
    const recoveredPod = result.runner!.getPod();
    expect(recoveredPod.status).toBe('active');
    expect(recoveredPod.current_phase).toBe('night');
    expect(recoveredPod.current_round).toBe(1);
  });

  it('should recover with default state if no checkpoint exists', async () => {
    // Don't start the game, so no checkpoint exists
    // Recovery should still work - it uses default state
    const result = await resumeGame(testPod.id, { moltbookService: mockMoltbook });

    expect(result.recovered).toBe(true);
    expect(result.runner).not.toBeNull();
    // State should be default (no checkpoint to restore from)
    expect(result.state).toBeDefined();
  });

  it('should return recoverable=false if pod does not exist', async () => {
    const result = await resumeGame('nonexistent-pod-id', { moltbookService: mockMoltbook });

    expect(result.recovered).toBe(false);
    expect(result.error).toBe('Pod not found');
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
