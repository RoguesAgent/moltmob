import { describe, it, expect } from 'vitest';
import { resolveNight, validateNightActions } from './night';
import { Player } from './types';

function makePlayer(overrides: Partial<Player> & { id: string; role: Player['role'] }): Player {
  return {
    agent_name: overrides.id,
    wallet_pubkey: `wallet_${overrides.id}`,
    encryption_pubkey: `enc_${overrides.id}`,
    status: 'alive',
    eliminated_by: null,
    eliminated_round: null,
    ...overrides,
  };
}

describe('Night Resolution', () => {
  // ── PRD §5 Phase 3: Night ──

  const basePlayers: Player[] = [
    makePlayer({ id: 'krill1', role: 'krill' }),
    makePlayer({ id: 'krill2', role: 'krill' }),
    makePlayer({ id: 'sg', role: 'shellguard' }),
    makePlayer({ id: 'cb', role: 'clawboss' }),
  ];

  it('T-NIGHT-001: Clawboss pinch eliminates target', () => {
    const result = resolveNight(
      [
        { player_id: 'cb', action: 'pinch', target_id: 'krill1' },
        { player_id: 'sg', action: 'dummy', target_id: null },
        { player_id: 'krill1', action: 'dummy', target_id: null },
        { player_id: 'krill2', action: 'dummy', target_id: null },
      ],
      basePlayers
    );
    expect(result.eliminated).toBe('krill1');
    expect(result.pinch_target).toBe('krill1');
    expect(result.pinch_blocked).toBe(false);
  });

  it('T-NIGHT-002: Shellguard protects same target → pinch blocked', () => {
    const result = resolveNight(
      [
        { player_id: 'cb', action: 'pinch', target_id: 'krill1' },
        { player_id: 'sg', action: 'protect', target_id: 'krill1' },
        { player_id: 'krill1', action: 'dummy', target_id: null },
        { player_id: 'krill2', action: 'dummy', target_id: null },
      ],
      basePlayers
    );
    expect(result.eliminated).toBeNull();
    expect(result.pinch_blocked).toBe(true);
    expect(result.pinch_target).toBe('krill1');
    expect(result.protect_target).toBe('krill1');
  });

  it('T-NIGHT-003: Shellguard protects different target → pinch succeeds', () => {
    const result = resolveNight(
      [
        { player_id: 'cb', action: 'pinch', target_id: 'krill1' },
        { player_id: 'sg', action: 'protect', target_id: 'krill2' },
        { player_id: 'krill1', action: 'dummy', target_id: null },
        { player_id: 'krill2', action: 'dummy', target_id: null },
      ],
      basePlayers
    );
    expect(result.eliminated).toBe('krill1');
    expect(result.pinch_blocked).toBe(false);
    expect(result.protect_target).toBe('krill2');
  });

  it('T-NIGHT-004: Shellguard self-protect is silently ignored', () => {
    const result = resolveNight(
      [
        { player_id: 'cb', action: 'pinch', target_id: 'krill1' },
        { player_id: 'sg', action: 'protect', target_id: 'sg' }, // self-protect!
        { player_id: 'krill1', action: 'dummy', target_id: null },
        { player_id: 'krill2', action: 'dummy', target_id: null },
      ],
      basePlayers
    );
    expect(result.eliminated).toBe('krill1'); // not blocked
    expect(result.protect_target).toBeNull(); // self-protect ignored
  });

  it('T-NIGHT-005: no pinch action → no elimination', () => {
    const result = resolveNight(
      [
        { player_id: 'cb', action: 'dummy', target_id: null },
        { player_id: 'sg', action: 'dummy', target_id: null },
        { player_id: 'krill1', action: 'dummy', target_id: null },
        { player_id: 'krill2', action: 'dummy', target_id: null },
      ],
      basePlayers
    );
    expect(result.eliminated).toBeNull();
    expect(result.pinch_target).toBeNull();
  });

  it('T-NIGHT-006: pinch target already dead → no elimination', () => {
    const players = [
      ...basePlayers.slice(1), // krill1 removed
      makePlayer({ id: 'krill1', role: 'krill', status: 'eliminated', eliminated_by: 'cooked' }),
    ];
    const result = resolveNight(
      [
        { player_id: 'cb', action: 'pinch', target_id: 'krill1' },
        { player_id: 'sg', action: 'dummy', target_id: null },
        { player_id: 'krill2', action: 'dummy', target_id: null },
      ],
      players
    );
    expect(result.eliminated).toBeNull();
  });
});

describe('Night Action Validation', () => {
  const players: Player[] = [
    makePlayer({ id: 'p1', role: 'krill' }),
    makePlayer({ id: 'p2', role: 'krill' }),
    makePlayer({ id: 'p3', role: 'clawboss' }),
    makePlayer({ id: 'dead', role: 'krill', status: 'eliminated', eliminated_by: 'pinched' }),
  ];

  it('T-NIGHT-010: all alive players must submit', () => {
    const errors = validateNightActions(
      [
        { player_id: 'p1', action: 'dummy', target_id: null },
        // p2 missing
        { player_id: 'p3', action: 'pinch', target_id: 'p1' },
      ],
      players
    );
    expect(errors.some((e) => e.includes('p2'))).toBe(true);
  });

  it('T-NIGHT-011: dead player cannot submit', () => {
    const errors = validateNightActions(
      [
        { player_id: 'p1', action: 'dummy', target_id: null },
        { player_id: 'p2', action: 'dummy', target_id: null },
        { player_id: 'p3', action: 'pinch', target_id: 'p1' },
        { player_id: 'dead', action: 'dummy', target_id: null },
      ],
      players
    );
    expect(errors.some((e) => e.includes('Dead'))).toBe(true);
  });

  it('T-NIGHT-012: Clawboss cannot target dead player', () => {
    const errors = validateNightActions(
      [
        { player_id: 'p1', action: 'dummy', target_id: null },
        { player_id: 'p2', action: 'dummy', target_id: null },
        { player_id: 'p3', action: 'pinch', target_id: 'dead' },
      ],
      players
    );
    expect(errors.some((e) => e.includes('dead player'))).toBe(true);
  });

  it('T-NIGHT-013: Clawboss cannot self-target', () => {
    const errors = validateNightActions(
      [
        { player_id: 'p1', action: 'dummy', target_id: null },
        { player_id: 'p2', action: 'dummy', target_id: null },
        { player_id: 'p3', action: 'pinch', target_id: 'p3' },
      ],
      players
    );
    expect(errors.some((e) => e.includes('themselves'))).toBe(true);
  });

  it('T-NIGHT-014: valid actions pass with no errors', () => {
    const errors = validateNightActions(
      [
        { player_id: 'p1', action: 'dummy', target_id: null },
        { player_id: 'p2', action: 'dummy', target_id: null },
        { player_id: 'p3', action: 'pinch', target_id: 'p1' },
      ],
      players
    );
    expect(errors).toEqual([]);
  });
});
