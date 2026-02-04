import { describe, it, expect } from 'vitest';
import {
  recruitmentPost,
  lobbyUpdatePost,
  gameStartPost,
  gameOverPost,
  cancellationPost,
  joinUrl,
} from './posts';
import { createPod, joinPod } from './lobby';
import { mockPlayer } from './test-helpers';
import { BASE_URL } from './types';

describe('Join URL', () => {
  it('T-POST-001: generates correct join URL', () => {
    expect(joinUrl(42)).toBe(`${BASE_URL}/api/game/join?pod=42`);
    expect(joinUrl(1)).toBe(`${BASE_URL}/api/game/join?pod=1`);
  });
});

describe('Recruitment Post', () => {
  it('T-POST-010: includes token, chain, entry fee, and join link', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 42,
      entry_fee: 10_000_000, // 0.01 SOL
      config: { lobby_timeout_ms: 300_000 },
    });

    const { title, content } = recruitmentPost(pod);

    // Title
    expect(title).toContain('Pod #42');
    expect(title).toContain('0.01');
    expect(title).toContain('WSOL');

    // Content — token & chain
    expect(content).toContain('**Token:** WSOL');
    expect(content).toContain('**Chain:** Solana Devnet');

    // Content — entry fee
    expect(content).toContain('**Entry:** 0.01 WSOL');

    // Content — player range
    expect(content).toContain('6–12');

    // Content — join link
    expect(content).toContain(`${BASE_URL}/api/game/join?pod=42`);

    // Content — lobby timeout
    expect(content).toContain('5 min');
  });

  it('T-POST-011: custom entry fee formats correctly', () => {
    const pod = createPod({
      id: 'pod_2',
      pod_number: 7,
      entry_fee: 100_000_000, // 0.1 SOL
      config: { lobby_timeout_ms: 600_000 },
    });

    const { title, content } = recruitmentPost(pod);
    expect(title).toContain('0.1 WSOL');
    expect(content).toContain('**Entry:** 0.1 WSOL');
    expect(content).toContain('10 min');
  });

  it('T-POST-012: 1 SOL entry fee formats without trailing zeros', () => {
    const pod = createPod({
      id: 'pod_3',
      pod_number: 99,
      entry_fee: 1_000_000_000,
      config: { lobby_timeout_ms: 300_000 },
    });

    const { title } = recruitmentPost(pod);
    expect(title).toContain('1 WSOL');
  });
});

describe('Lobby Update Post', () => {
  it('T-POST-020: shows current player count and slots needed', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 42,
      config: { lobby_timeout_ms: 300_000 },
    });
    for (let i = 0; i < 3; i++) joinPod(pod, mockPlayer(i));

    const { title, content } = lobbyUpdatePost(pod);

    expect(title).toContain('3/6');
    expect(content).toContain('needs 3 more agents');
    expect(content).toContain('WSOL');
    expect(content).toContain('Solana Devnet');
    expect(content).toContain(`${BASE_URL}/api/game/join?pod=42`);
  });

  it('T-POST-021: singular "agent" when 1 needed', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      config: { lobby_timeout_ms: 300_000 },
    });
    for (let i = 0; i < 5; i++) joinPod(pod, mockPlayer(i));

    const { content } = lobbyUpdatePost(pod);
    expect(content).toContain('needs 1 more agent to start');
  });
});

describe('Game Start Post', () => {
  it('T-POST-030: includes player names and total pot', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 42,
      entry_fee: 10_000_000,
      config: { lobby_timeout_ms: 300_000 },
    });
    for (let i = 0; i < 6; i++) joinPod(pod, mockPlayer(i));

    const { title, content } = gameStartPost(pod);

    expect(title).toContain('GAME ON');
    expect(title).toContain('6 agents');
    expect(title).toContain('0.06 WSOL'); // 6 * 0.01

    // Player names
    expect(content).toContain('CrabbyPatton');
    expect(content).toContain('LobsterLord');
    expect(content).toContain('Solana Devnet');
  });
});

describe('Game Over Post', () => {
  it('T-POST-040: Pod win shows survivors and eliminated', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 42,
      entry_fee: 10_000_000,
      config: { lobby_timeout_ms: 300_000 },
    });
    for (let i = 0; i < 6; i++) joinPod(pod, mockPlayer(i));

    pod.winner_side = 'pod';
    pod.current_round = 4;
    pod.boil_meter = 30;
    pod.players[0].status = 'eliminated';
    pod.players[0].eliminated_by = 'pinched';

    const { title, content } = gameOverPost(pod);

    expect(title).toContain('Pod (Loyalists) wins');
    expect(title).toContain('0.06 WSOL');
    expect(content).toContain('4 rounds');
    expect(content).toContain('30%');
    expect(content).toContain('CrabbyPatton (pinched)');
    expect(content).toContain('Solana Devnet');
  });

  it('T-POST-041: Clawboss win', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 7,
      entry_fee: 50_000_000,
      config: { lobby_timeout_ms: 300_000 },
    });
    for (let i = 0; i < 6; i++) joinPod(pod, mockPlayer(i));
    pod.winner_side = 'clawboss';
    pod.current_round = 6;

    const { title } = gameOverPost(pod);
    expect(title).toContain('Clawboss (Moltbreakers) wins');
    expect(title).toContain('0.3 WSOL'); // 6 * 0.05
  });
});

describe('Cancellation Post', () => {
  it('T-POST-050: shows reason and refund info', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 42,
      entry_fee: 10_000_000,
      config: { lobby_timeout_ms: 300_000 },
    });
    for (let i = 0; i < 4; i++) joinPod(pod, mockPlayer(i));

    const { title, content } = cancellationPost(pod, 'Lobby timed out with 4/6 players');

    expect(title).toContain('Pod #42');
    expect(title).toContain('Cancelled');
    expect(content).toContain('Lobby timed out with 4/6 players');
    expect(content).toContain('4 agents refunded 0.01 WSOL each');
    expect(content).toContain('Solana Devnet');
  });

  it('T-POST-051: singular agent refund', () => {
    const pod = createPod({
      id: 'pod_1',
      pod_number: 1,
      entry_fee: 10_000_000,
      config: { lobby_timeout_ms: 300_000 },
    });
    joinPod(pod, mockPlayer(0));

    const { content } = cancellationPost(pod, 'Not enough players');
    expect(content).toContain('1 agent refunded');
  });
});
