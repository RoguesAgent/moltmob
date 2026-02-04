import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPod, joinPod, getJoinUrl, canStartGame, isLobbyExpired, cancelPod, checkLobbyTimeout } from './lobby';
import { mockPlayer } from './test-helpers';
import { MIN_PLAYERS, MAX_PLAYERS, HARD_MAX_PLAYERS } from './types';

describe('Pod Creation', () => {
  it('T-LOBBY-001: creates a pod in lobby state', () => {
    const pod = createPod({ id: 'pod_1', pod_number: 1 });
    expect(pod.status).toBe('lobby');
    expect(pod.current_phase).toBe('lobby');
    expect(pod.players).toEqual([]);
    expect(pod.min_players).toBe(MIN_PLAYERS);
    expect(pod.max_players).toBe(12);
    expect(pod.boil_meter).toBe(0);
    expect(pod.current_round).toBe(0);
  });

  it('T-LOBBY-002: sets lobby deadline from config', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      config: { lobby_timeout_ms: 60_000 },
    });
    expect(pod.lobby_deadline).toBeGreaterThan(Date.now() - 1000);
    expect(pod.config.lobby_timeout_ms).toBe(60_000);
  });

  it('T-LOBBY-003: default entry fee is 0.01 SOL', () => {
    const pod = createPod({ id: 'pod_1', pod_number: 1 });
    expect(pod.entry_fee).toBe(10_000_000);
  });
});

describe('Join URL', () => {
  it('T-LOBBY-005: join URL includes pod, network, and token', () => {
    const pod = createPod({
      id: 'pod_42',
      pod_number: 42,
      config: { network_name: 'solana-devnet', token: 'WSOL' },
    });
    const url = getJoinUrl(pod);
    expect(url).toBe('https://moltmob.com/api/game/join?pod=pod_42&network=solana-devnet&token=WSOL');
  });

  it('T-LOBBY-006: join URL reflects mainnet config', () => {
    const pod = createPod({
      id: 'pod_99',
      pod_number: 99,
      config: { network_name: 'solana-mainnet', token: 'WSOL' },
    });
    const url = getJoinUrl(pod);
    const parsed = new URL(url);
    expect(parsed.searchParams.get('pod')).toBe('pod_99');
    expect(parsed.searchParams.get('network')).toBe('solana-mainnet');
    expect(parsed.searchParams.get('token')).toBe('WSOL');
  });

  it('T-LOBBY-007: join URL is parseable and has correct base', () => {
    const pod = createPod({ id: 'pod_1', pod_number: 1 });
    const url = new URL(getJoinUrl(pod));
    expect(url.origin).toBe('https://moltmob.com');
    expect(url.pathname).toBe('/api/game/join');
  });
});

describe('Joining a Pod', () => {
  it('T-LOBBY-010: player can join an open lobby', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      config: { lobby_timeout_ms: 300_000 },
    });
    const player = mockPlayer(0);
    const error = joinPod(pod, player);

    expect(error).toBeNull();
    expect(pod.players).toHaveLength(1);
    expect(pod.players[0].id).toBe('agent_0');
    expect(pod.players[0].role).toBeNull(); // no role yet
    expect(pod.players[0].status).toBe('alive');
  });

  it('T-LOBBY-011: 6 mock players can join successfully', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      config: { lobby_timeout_ms: 300_000 },
    });

    for (let i = 0; i < 6; i++) {
      const err = joinPod(pod, mockPlayer(i));
      expect(err).toBeNull();
    }
    expect(pod.players).toHaveLength(6);
  });

  it('T-LOBBY-012: cannot join same pod twice', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      config: { lobby_timeout_ms: 300_000 },
    });
    joinPod(pod, mockPlayer(0));
    const err = joinPod(pod, mockPlayer(0));
    expect(err).toContain('already in pod');
  });

  it('T-LOBBY-013: race condition — 13th player expands pod instead of rejecting', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      config: { lobby_timeout_ms: 300_000 },
    });

    // Fill to soft max (12)
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const err = joinPod(pod, mockPlayer(i));
      expect(err).toBeNull();
    }

    // 13th player — race condition, should expand
    const err = joinPod(pod, mockPlayer(12));
    expect(err).toBeNull();
    expect(pod.players).toHaveLength(13);
    expect(pod.max_players).toBe(13); // expanded
  });

  it('T-LOBBY-013b: hard max (16) cannot be exceeded', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      config: { lobby_timeout_ms: 300_000 },
    });

    for (let i = 0; i < HARD_MAX_PLAYERS; i++) {
      joinPod(pod, mockPlayer(i));
    }
    const err = joinPod(pod, mockPlayer(HARD_MAX_PLAYERS));
    expect(err).toContain('hard maximum');
    expect(pod.players).toHaveLength(HARD_MAX_PLAYERS);
  });

  it('T-LOBBY-013c: overflow expands max_players incrementally', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      config: { lobby_timeout_ms: 300_000 },
    });

    for (let i = 0; i < 14; i++) {
      joinPod(pod, mockPlayer(i));
    }
    expect(pod.max_players).toBe(14);
    expect(pod.players).toHaveLength(14);
  });

  it('T-LOBBY-014: cannot join a cancelled pod', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      config: { lobby_timeout_ms: 300_000 },
    });
    pod.status = 'cancelled';
    const err = joinPod(pod, mockPlayer(0));
    expect(err).toContain('not in lobby state');
  });

  it('T-LOBBY-015: cannot join an expired lobby', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      config: { lobby_timeout_ms: 1 }, // 1ms timeout
    });
    // Wait a tick so deadline passes
    pod.lobby_deadline = Date.now() - 1000; // force expired

    const err = joinPod(pod, mockPlayer(0));
    expect(err).toContain('expired');
  });
});

describe('Game Start Check', () => {
  it('T-LOBBY-020: can start with 6 players', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      config: { lobby_timeout_ms: 300_000 },
    });
    for (let i = 0; i < 6; i++) joinPod(pod, mockPlayer(i));

    expect(canStartGame(pod)).toBe(true);
  });

  it('T-LOBBY-021: cannot start with 5 players', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      config: { lobby_timeout_ms: 300_000 },
    });
    for (let i = 0; i < 5; i++) joinPod(pod, mockPlayer(i));

    expect(canStartGame(pod)).toBe(false);
  });

  it('T-LOBBY-022: cannot start with 0 players', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      config: { lobby_timeout_ms: 300_000 },
    });
    expect(canStartGame(pod)).toBe(false);
  });

  it('T-LOBBY-023: can start with 12 players', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      config: { lobby_timeout_ms: 300_000 },
    });
    for (let i = 0; i < 12; i++) joinPod(pod, mockPlayer(i));

    expect(canStartGame(pod)).toBe(true);
  });
});

describe('Lobby Timeout & Cancellation', () => {
  it('T-LOBBY-030: lobby not expired before deadline', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      config: { lobby_timeout_ms: 300_000 },
    });
    expect(isLobbyExpired(pod)).toBe(false);
  });

  it('T-LOBBY-031: lobby expired after deadline', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      config: { lobby_timeout_ms: 300_000 },
    });
    pod.lobby_deadline = Date.now() - 1000; // force expired
    expect(isLobbyExpired(pod)).toBe(true);
  });

  it('T-LOBBY-032: cancel pod with 3 players → all 3 get full refund', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      entry_fee: 10_000_000,
      config: { lobby_timeout_ms: 300_000 },
    });
    for (let i = 0; i < 3; i++) joinPod(pod, mockPlayer(i));

    const result = cancelPod(pod, 'Not enough players');

    expect(result.cancelled).toBe(true);
    expect(result.refunds).toHaveLength(3);
    expect(pod.status).toBe('cancelled');
    expect(pod.current_phase).toBe('ended');

    // Every player gets full entry fee back
    for (const refund of result.refunds) {
      expect(refund.amount).toBe(10_000_000);
      expect(refund.reason).toBe('refund');
    }
  });

  it('T-LOBBY-033: cancel pod with 0 players → empty refunds', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      config: { lobby_timeout_ms: 300_000 },
    });

    const result = cancelPod(pod, 'No players joined');

    expect(result.cancelled).toBe(true);
    expect(result.refunds).toEqual([]);
    expect(pod.status).toBe('cancelled');
  });

  it('T-LOBBY-034: cancel pod with 5 players → all 5 refunded', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      entry_fee: 50_000_000,
      config: { lobby_timeout_ms: 300_000 },
    });
    for (let i = 0; i < 5; i++) joinPod(pod, mockPlayer(i));

    const result = cancelPod(pod, 'Lobby timeout');

    expect(result.cancelled).toBe(true);
    expect(result.refunds).toHaveLength(5);
    expect(result.refunds.every((r) => r.amount === 50_000_000)).toBe(true);
    expect(result.refunds.every((r) => r.reason === 'refund')).toBe(true);

    // Check each player's wallet is in refunds
    for (let i = 0; i < 5; i++) {
      expect(result.refunds.some((r) => r.player_id === `agent_${i}`)).toBe(true);
      expect(result.refunds.some((r) => r.wallet_pubkey === `wallet_agent_${i}`)).toBe(true);
    }
  });

  it('T-LOBBY-035: cannot cancel a non-lobby pod', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      config: { lobby_timeout_ms: 300_000 },
    });
    pod.status = 'active';

    const result = cancelPod(pod, 'test');
    expect(result.cancelled).toBe(false);
    expect(result.refunds).toEqual([]);
  });

  it('T-LOBBY-036: checkLobbyTimeout cancels when expired + insufficient players', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      entry_fee: 10_000_000,
      config: { lobby_timeout_ms: 300_000 },
    });
    // Add 4 players (below min 6)
    for (let i = 0; i < 4; i++) joinPod(pod, mockPlayer(i));

    // Force expired
    const futureTime = pod.lobby_deadline + 1000;
    const result = checkLobbyTimeout(pod, futureTime);

    expect(result).not.toBeNull();
    expect(result!.cancelled).toBe(true);
    expect(result!.refunds).toHaveLength(4);
    expect(result!.reason).toContain('4/6');
    expect(pod.status).toBe('cancelled');
  });

  it('T-LOBBY-037: checkLobbyTimeout does NOT cancel when not expired', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      config: { lobby_timeout_ms: 300_000 },
    });
    for (let i = 0; i < 3; i++) joinPod(pod, mockPlayer(i));

    const result = checkLobbyTimeout(pod);
    expect(result).toBeNull();
    expect(pod.status).toBe('lobby');
  });

  it('T-LOBBY-038: checkLobbyTimeout does NOT cancel when expired but has enough players', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      config: { lobby_timeout_ms: 300_000 },
    });
    for (let i = 0; i < 6; i++) joinPod(pod, mockPlayer(i));

    const futureTime = pod.lobby_deadline + 1000;
    const result = checkLobbyTimeout(pod, futureTime);

    expect(result).toBeNull(); // should have started, not cancelled
    expect(pod.status).toBe('lobby'); // unchanged
  });

  it('T-LOBBY-039: total refund amount equals total entry fees collected', () => {
    const entryFee = 25_000_000;
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      entry_fee: entryFee,
      config: { lobby_timeout_ms: 300_000 },
    });
    for (let i = 0; i < 5; i++) joinPod(pod, mockPlayer(i));

    const result = cancelPod(pod, 'timeout');
    const totalRefunded = result.refunds.reduce((sum, r) => sum + r.amount, 0);
    const totalCollected = entryFee * 5;

    expect(totalRefunded).toBe(totalCollected);
  });
});
