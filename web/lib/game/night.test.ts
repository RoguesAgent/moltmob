import { describe, it, expect } from 'vitest';
import { resolveNight, validateNightActions } from './night';
import { mockRoledPlayers, pid } from './test-helpers';

describe('Night Resolution (6 players — no Initiate)', () => {
  // Standard 6-player: [0-4] Krill, [5] Clawboss

  it('T-NIGHT-001: Clawboss pinch eliminates target', () => {
    const players = mockRoledPlayers();

    const result = resolveNight(
      [
        { player_id: pid(5), action: 'pinch', target_id: pid(0) },
        { player_id: pid(0), action: 'scuttle', target_id: null },
        { player_id: pid(1), action: 'scuttle', target_id: null },
        { player_id: pid(2), action: 'scuttle', target_id: null },
        { player_id: pid(3), action: 'scuttle', target_id: null },
        { player_id: pid(4), action: 'scuttle', target_id: null },
      ],
      players
    );

    expect(result.eliminated).toBe(pid(0));
    expect(result.pinch_target).toBe(pid(0));
    expect(result.pinch_blocked).toBe(false);
  });

  it('T-NIGHT-002: no pinch action → no elimination', () => {
    const players = mockRoledPlayers();

    const result = resolveNight(
      players.map((p) => ({
        player_id: p.id,
        action: 'scuttle' as const,
        target_id: null,
      })),
      players
    );

    expect(result.eliminated).toBeNull();
    expect(result.pinch_target).toBeNull();
  });

  it('T-NIGHT-003: pinch dead target → no elimination', () => {
    const players = mockRoledPlayers({ eliminated: [pid(0)] });

    const result = resolveNight(
      [
        { player_id: pid(5), action: 'pinch', target_id: pid(0) },
        { player_id: pid(1), action: 'scuttle', target_id: null },
        { player_id: pid(2), action: 'scuttle', target_id: null },
        { player_id: pid(3), action: 'scuttle', target_id: null },
        { player_id: pid(4), action: 'scuttle', target_id: null },
      ],
      players
    );

    expect(result.eliminated).toBeNull();
  });
});

describe('Night with Shellguard (8 players)', () => {
  // 8-player: [0-4] Krill, [5] Shellguard, [6] Clawboss, [7] Initiate

  it('T-NIGHT-010: Shellguard protects same target → pinch blocked', () => {
    const players = mockRoledPlayers({ count: 8 });

    const result = resolveNight(
      [
        { player_id: pid(6), action: 'pinch', target_id: pid(0) },
        { player_id: pid(5), action: 'protect', target_id: pid(0) },
        { player_id: pid(0), action: 'scuttle', target_id: null },
        { player_id: pid(1), action: 'scuttle', target_id: null },
        { player_id: pid(2), action: 'scuttle', target_id: null },
        { player_id: pid(3), action: 'scuttle', target_id: null },
        { player_id: pid(4), action: 'scuttle', target_id: null },
        { player_id: pid(7), action: 'scuttle', target_id: null },
      ],
      players
    );

    expect(result.eliminated).toBeNull();
    expect(result.pinch_blocked).toBe(true);
  });

  it('T-NIGHT-011: Shellguard protects wrong target → pinch succeeds', () => {
    const players = mockRoledPlayers({ count: 8 });

    const result = resolveNight(
      [
        { player_id: pid(6), action: 'pinch', target_id: pid(0) },
        { player_id: pid(5), action: 'protect', target_id: pid(1) },
        { player_id: pid(0), action: 'scuttle', target_id: null },
        { player_id: pid(1), action: 'scuttle', target_id: null },
        { player_id: pid(2), action: 'scuttle', target_id: null },
        { player_id: pid(3), action: 'scuttle', target_id: null },
        { player_id: pid(4), action: 'scuttle', target_id: null },
        { player_id: pid(7), action: 'scuttle', target_id: null },
      ],
      players
    );

    expect(result.eliminated).toBe(pid(0));
    expect(result.pinch_blocked).toBe(false);
  });

  it('T-NIGHT-012: Shellguard self-protect is silently ignored', () => {
    const players = mockRoledPlayers({ count: 8 });

    const result = resolveNight(
      [
        { player_id: pid(6), action: 'pinch', target_id: pid(0) },
        { player_id: pid(5), action: 'protect', target_id: pid(5) },
        { player_id: pid(0), action: 'scuttle', target_id: null },
        { player_id: pid(1), action: 'scuttle', target_id: null },
        { player_id: pid(2), action: 'scuttle', target_id: null },
        { player_id: pid(3), action: 'scuttle', target_id: null },
        { player_id: pid(4), action: 'scuttle', target_id: null },
        { player_id: pid(7), action: 'scuttle', target_id: null },
      ],
      players
    );

    expect(result.eliminated).toBe(pid(0));
    expect(result.protect_target).toBeNull();
  });
});

describe('Night Action Validation (6 players)', () => {
  it('T-NIGHT-020: all alive players must submit', () => {
    const players = mockRoledPlayers();

    const errors = validateNightActions(
      [
        { player_id: pid(0), action: 'scuttle', target_id: null },
        // pid(1) missing!
        { player_id: pid(2), action: 'scuttle', target_id: null },
        { player_id: pid(3), action: 'scuttle', target_id: null },
        { player_id: pid(4), action: 'scuttle', target_id: null },
        { player_id: pid(5), action: 'pinch', target_id: pid(0) },
      ],
      players
    );

    expect(errors.some((e) => e.includes(pid(1)))).toBe(true);
  });

  it('T-NIGHT-021: dead player cannot submit', () => {
    const players = mockRoledPlayers({ eliminated: [pid(0)] });

    const errors = validateNightActions(
      [
        { player_id: pid(0), action: 'scuttle', target_id: null },
        { player_id: pid(1), action: 'scuttle', target_id: null },
        { player_id: pid(2), action: 'scuttle', target_id: null },
        { player_id: pid(3), action: 'scuttle', target_id: null },
        { player_id: pid(4), action: 'scuttle', target_id: null },
        { player_id: pid(5), action: 'pinch', target_id: pid(1) },
      ],
      players
    );

    expect(errors.some((e) => e.includes('Dead'))).toBe(true);
  });

  it('T-NIGHT-022: Clawboss cannot self-target', () => {
    const players = mockRoledPlayers();

    const errors = validateNightActions(
      [
        { player_id: pid(0), action: 'scuttle', target_id: null },
        { player_id: pid(1), action: 'scuttle', target_id: null },
        { player_id: pid(2), action: 'scuttle', target_id: null },
        { player_id: pid(3), action: 'scuttle', target_id: null },
        { player_id: pid(4), action: 'scuttle', target_id: null },
        { player_id: pid(5), action: 'pinch', target_id: pid(5) },
      ],
      players
    );

    expect(errors.some((e) => e.includes('themselves'))).toBe(true);
  });

  it('T-NIGHT-023: valid actions pass with no errors', () => {
    const players = mockRoledPlayers();

    const errors = validateNightActions(
      [
        { player_id: pid(0), action: 'scuttle', target_id: null },
        { player_id: pid(1), action: 'scuttle', target_id: null },
        { player_id: pid(2), action: 'scuttle', target_id: null },
        { player_id: pid(3), action: 'scuttle', target_id: null },
        { player_id: pid(4), action: 'scuttle', target_id: null },
        { player_id: pid(5), action: 'pinch', target_id: pid(0) },
      ],
      players
    );

    expect(errors).toEqual([]);
  });
});
