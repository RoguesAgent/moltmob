/**
 * Crash Recovery Test
 * Validates that game state is correctly persisted and recoverable
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Pod } from '@/lib/game/types';

// Mock Supabase with factory function (no external variables)
vi.mock('@/lib/supabase', () => {
  const createMockChain = (resolveValue: any = { data: null, error: null }) => {
    const chain: any = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.insert = vi.fn().mockResolvedValue(resolveValue);
    chain.upsert = vi.fn().mockResolvedValue(resolveValue);
    chain.update = vi.fn().mockReturnValue(chain);
    chain.delete = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.in = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockResolvedValue(resolveValue);
    chain.maybeSingle = vi.fn().mockResolvedValue(resolveValue);
    chain.then = (resolve: Function) => Promise.resolve(resolve(resolveValue));
    return chain;
  };

  return {
    supabaseAdmin: {
      from: vi.fn(() => createMockChain({ data: null, error: null })),
    },
  };
});

// Now import modules that depend on supabase
import { GameRunner, enableCheckpointPersistence } from '@/lib/game/runner';
import { resumeGame } from '@/lib/game/runner-resume';
import { MockMoltbookService } from '@/lib/game/moltbook-service';
import { supabaseAdmin } from '@/lib/supabase';

// Generate a random UUID
function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Get reference to mocked supabaseAdmin for test setup
const mockFrom = vi.mocked(supabaseAdmin.from);

// Helper to create mock chain for test setup
function createTestMockChain(resolveValue: any = { data: null, error: null }) {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockResolvedValue(resolveValue);
  chain.upsert = vi.fn().mockResolvedValue(resolveValue);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolveValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolveValue);
  chain.then = (resolve: Function) => Promise.resolve(resolve(resolveValue));
  return chain;
}

describe('Crash Recovery', () => {
  let mockMoltbook: MockMoltbookService;
  let testPod: Pod;
  let testPodId: string;
  let testAgentIds: string[];

  beforeEach(async () => {
    vi.clearAllMocks();
    mockMoltbook = new MockMoltbookService();
    
    // Generate proper UUIDs
    testPodId = randomUUID();
    testAgentIds = Array.from({ length: 6 }, () => randomUUID());

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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create a checkpoint after starting game', async () => {
    // Mock the upsert/insert calls to succeed
    mockFrom.mockImplementation(() => createTestMockChain({ data: null, error: null }));

    const runner = new GameRunner(testPod, { moltbookService: mockMoltbook });
    enableCheckpointPersistence(runner);
    const transition = await runner.start();

    expect(transition.pod.status).toBe('active');
    expect(transition.pod.current_phase).toBe('night');

    // Wait for checkpoint to be written (async)
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify checkpoint was attempted (insert to gm_events)
    expect(mockFrom).toHaveBeenCalledWith('gm_events');
  });

  it('should recover game from checkpoint', async () => {
    // Mock DB responses for recovery
    const mockPodData = {
      id: testPod.id,
      pod_number: testPod.pod_number,
      status: 'active',
      current_phase: 'night',
      current_round: 1,
      boil_meter: 0,
      entry_fee: testPod.entry_fee,
      min_players: 6,
      max_players: 12,
      network_name: 'solana-devnet',
      token: 'WSOL',
    };

    const mockPlayersData = testPod.players.map(p => ({
      agent_id: p.id,
      agent_name: p.agent_name,
      wallet_pubkey: p.wallet_pubkey,
      encryption_pubkey: p.encryption_pubkey,
      role: p.role,
      status: p.status,
    }));

    // Setup mocks for different tables
    mockFrom.mockImplementation((table: string) => {
      if (table === 'game_pods') {
        return createTestMockChain({ data: mockPodData, error: null });
      }
      if (table === 'game_players') {
        return createTestMockChain({ data: mockPlayersData, error: null });
      }
      if (table === 'gm_events') {
        return createTestMockChain({ data: [], error: null });
      }
      return createTestMockChain({ data: null, error: null });
    });

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

  it('should recover with default state if no checkpoint exists', async () => {
    // Mock pod data but no checkpoint
    const mockPodData = {
      id: testPod.id,
      pod_number: testPod.pod_number,
      status: 'lobby',
      current_phase: 'lobby',
      current_round: 0,
      boil_meter: 0,
      entry_fee: testPod.entry_fee,
      min_players: 6,
      max_players: 12,
      network_name: 'solana-devnet',
      token: 'WSOL',
    };

    const mockPlayersData = testPod.players.map(p => ({
      agent_id: p.id,
      agent_name: p.agent_name,
      wallet_pubkey: p.wallet_pubkey,
      encryption_pubkey: p.encryption_pubkey,
      role: p.role,
      status: p.status,
    }));

    mockFrom.mockImplementation((table: string) => {
      if (table === 'game_pods') {
        return createTestMockChain({ data: mockPodData, error: null });
      }
      if (table === 'game_players') {
        return createTestMockChain({ data: mockPlayersData, error: null });
      }
      if (table === 'gm_events') {
        return createTestMockChain({ data: [], error: null });
      }
      return createTestMockChain({ data: null, error: null });
    });

    const result = await resumeGame(testPod.id, { moltbookService: mockMoltbook });

    expect(result.recovered).toBe(true);
    expect(result.runner).not.toBeNull();
    expect(result.state).toBeDefined();
  });

  it('should return recoverable=false if pod does not exist', async () => {
    // Mock pod not found
    mockFrom.mockImplementation(() => 
      createTestMockChain({ data: null, error: { message: 'not found' } })
    );

    const result = await resumeGame('nonexistent-pod-id', { moltbookService: mockMoltbook });

    expect(result.recovered).toBe(false);
    expect(result.error).toBe('Pod not found');
  });
});
