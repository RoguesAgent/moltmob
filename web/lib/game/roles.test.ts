import { describe, it, expect } from 'vitest';
import { getRoleDistribution, getRoleDistributionSeeded, assignRoles, validateDistribution } from './roles';
import { MIN_PLAYERS, MAX_PLAYERS, HARD_MAX_PLAYERS } from './types';

describe('Role Distribution', () => {
  it('T-ROLE-001: rejects fewer than 6 players', () => {
    expect(() => getRoleDistribution(5)).toThrow(`fewer than ${MIN_PLAYERS}`);
    expect(() => getRoleDistribution(3)).toThrow(`fewer than ${MIN_PLAYERS}`);
    expect(() => getRoleDistribution(0)).toThrow(`fewer than ${MIN_PLAYERS}`);
  });

  it('T-ROLE-002: rejects more than 16 players (hard max)', () => {
    expect(() => getRoleDistribution(17)).toThrow('more than 16');
    expect(() => getRoleDistribution(100)).toThrow('more than 16');
  });

  // ── 13-16: overflow (race condition) — extra slots are Krill ──
  it('T-ROLE-002b: 13 players (overflow) — same as 12 but +1 Krill', () => {
    const dist = getRoleDistributionSeeded(13, 0.2);
    expect(dist.clawboss).toBe(2);
    expect(dist.initiate).toBe(1); // low seed
    expect(dist.shellguard).toBe(2);
    expect(dist.krill).toBe(8); // 7+1 overflow
    expect(dist.krill + dist.shellguard + dist.clawboss + dist.initiate).toBe(13);
  });

  it('T-ROLE-002c: 16 players (hard max) — works', () => {
    const dist = getRoleDistributionSeeded(16, 0.8);
    expect(dist.clawboss).toBe(2);
    expect(dist.initiate).toBe(1); // only 12 exact gets 1-2 random; overflow gets 1
    expect(dist.shellguard).toBe(2);
    expect(dist.krill).toBe(11);
    expect(dist.krill + dist.shellguard + dist.clawboss + dist.initiate).toBe(16);
  });

  // ── 6 players: 5K + 1CB, NO Initiate ──
  it('T-ROLE-003: 6 players — 5 Krill + 1 Clawboss, 0 Initiate', () => {
    const dist = getRoleDistributionSeeded(6, 0.5);
    expect(dist.clawboss).toBe(1);
    expect(dist.initiate).toBe(0);
    expect(dist.shellguard).toBe(0);
    expect(dist.krill).toBe(5);
  });

  // ── 7 players: 5K + 1CB + 1Init ──
  it('T-ROLE-004: 7 players — 5 Krill + 1 CB + 1 Initiate', () => {
    const dist = getRoleDistributionSeeded(7, 0.5);
    expect(dist.clawboss).toBe(1);
    expect(dist.initiate).toBe(1);
    expect(dist.shellguard).toBe(0);
    expect(dist.krill).toBe(5);
  });

  // ── 8 players: 5K + 1SG + 1CB + 1Init ──
  it('T-ROLE-005: 8 players — Shellguard enters, 5K + 1SG + 1CB + 1Init', () => {
    const dist = getRoleDistributionSeeded(8, 0.5);
    expect(dist.clawboss).toBe(1);
    expect(dist.initiate).toBe(1);
    expect(dist.shellguard).toBe(1);
    expect(dist.krill).toBe(5);
  });

  // ── 9 players: 6K + 1SG + 1CB + 1Init ──
  it('T-ROLE-006: 9 players — 6K + 1SG + 1CB + 1Init', () => {
    const dist = getRoleDistributionSeeded(9, 0.5);
    expect(dist.clawboss).toBe(1);
    expect(dist.initiate).toBe(1);
    expect(dist.shellguard).toBe(1);
    expect(dist.krill).toBe(6);
  });

  // ── 10 players: 1-2 Clawboss (random) ──
  it('T-ROLE-007: 10 players (low seed) — 1 Clawboss', () => {
    const dist = getRoleDistributionSeeded(10, 0.2);
    expect(dist.clawboss).toBe(1);
    expect(dist.initiate).toBe(1);
    expect(dist.shellguard).toBe(1);
    expect(dist.krill).toBe(7);
  });

  it('T-ROLE-008: 10 players (high seed) — 2 Clawboss', () => {
    const dist = getRoleDistributionSeeded(10, 0.8);
    expect(dist.clawboss).toBe(2);
    expect(dist.initiate).toBe(1);
    expect(dist.shellguard).toBe(1);
    expect(dist.krill).toBe(6);
  });

  // ── 11 players: always 2 Clawboss ──
  it('T-ROLE-009: 11 players — 7K + 1SG + 2CB + 1Init', () => {
    const dist = getRoleDistributionSeeded(11, 0.5);
    expect(dist.clawboss).toBe(2);
    expect(dist.initiate).toBe(1);
    expect(dist.shellguard).toBe(1);
    expect(dist.krill).toBe(7);
  });

  // ── 12 players: 2CB, 1-2 Initiate (random), 2SG ──
  it('T-ROLE-010: 12 players (low seed) — 2CB + 1Init + 2SG + 7K', () => {
    const dist = getRoleDistributionSeeded(12, 0.2);
    expect(dist.clawboss).toBe(2);
    expect(dist.initiate).toBe(1);
    expect(dist.shellguard).toBe(2);
    expect(dist.krill).toBe(7);
  });

  it('T-ROLE-011: 12 players (high seed) — 2CB + 2Init + 2SG + 6K', () => {
    const dist = getRoleDistributionSeeded(12, 0.8);
    expect(dist.clawboss).toBe(2);
    expect(dist.initiate).toBe(2);
    expect(dist.shellguard).toBe(2);
    expect(dist.krill).toBe(6);
  });

  // ── Invariants across all counts ──
  it('T-ROLE-012: total roles always equals player count (6-16, seeded)', () => {
    for (let n = MIN_PLAYERS; n <= HARD_MAX_PLAYERS; n++) {
      for (const seed of [0.1, 0.5, 0.9]) {
        const dist = getRoleDistributionSeeded(n, seed);
        const total = dist.krill + dist.shellguard + dist.clawboss + dist.initiate;
        expect(total).toBe(n);
      }
    }
  });

  it('T-ROLE-013: at least 1 Krill at every player count (6-16)', () => {
    for (let n = MIN_PLAYERS; n <= HARD_MAX_PLAYERS; n++) {
      for (const seed of [0.1, 0.9]) {
        expect(getRoleDistributionSeeded(n, seed).krill).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('T-ROLE-014: 6 players NEVER has Initiate (both seeds)', () => {
    expect(getRoleDistributionSeeded(6, 0.1).initiate).toBe(0);
    expect(getRoleDistributionSeeded(6, 0.9).initiate).toBe(0);
  });

  it('T-ROLE-015: 10 players randomizes Clawboss count', () => {
    // Run the non-seeded version many times, should see both 1 and 2
    const counts = new Set<number>();
    for (let i = 0; i < 50; i++) {
      counts.add(getRoleDistribution(10).clawboss);
    }
    expect(counts.has(1)).toBe(true);
    expect(counts.has(2)).toBe(true);
  });

  it('T-ROLE-016: 12 players randomizes Initiate count', () => {
    const counts = new Set<number>();
    for (let i = 0; i < 50; i++) {
      counts.add(getRoleDistribution(12).initiate);
    }
    expect(counts.has(1)).toBe(true);
    expect(counts.has(2)).toBe(true);
  });
});

describe('Role Assignment', () => {
  it('T-ROLE-020: assigns correct roles to 6 players (no Initiate)', () => {
    const ids = ['a0', 'a1', 'a2', 'a3', 'a4', 'a5'];
    const assignments = assignRoles(ids);
    expect(assignments.size).toBe(6);

    const roles = [...assignments.values()];
    expect(roles.filter((r) => r === 'clawboss').length).toBe(1);
    expect(roles.filter((r) => r === 'initiate').length).toBe(0);
    expect(roles.filter((r) => r === 'krill').length).toBe(5);
  });

  it('T-ROLE-021: assigns correct roles to 7 players (has Initiate)', () => {
    const ids = ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
    const assignments = assignRoles(ids);
    const roles = [...assignments.values()];

    expect(roles.filter((r) => r === 'clawboss').length).toBe(1);
    expect(roles.filter((r) => r === 'initiate').length).toBe(1);
    expect(roles.filter((r) => r === 'krill').length).toBe(5);
  });

  it('T-ROLE-022: 11 players gets 2 Clawboss', () => {
    const ids = Array.from({ length: 11 }, (_, i) => `a${i}`);
    const assignments = assignRoles(ids);
    const roles = [...assignments.values()];

    expect(roles.filter((r) => r === 'clawboss').length).toBe(2);
  });

  it('T-ROLE-023: assignments are randomized', () => {
    const ids = ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
    const results = new Set<string>();
    for (let i = 0; i < 20; i++) {
      results.add(assignRoles(ids).get('a0')!);
    }
    expect(results.size).toBeGreaterThan(1);
  });
});

describe('Distribution Validation', () => {
  it('T-ROLE-030: valid 6-player distribution passes', () => {
    const errors = validateDistribution(
      { krill: 5, shellguard: 0, clawboss: 1, initiate: 0 },
      6
    );
    expect(errors).toEqual([]);
  });

  it('T-ROLE-031: valid 8-player distribution passes', () => {
    const errors = validateDistribution(
      { krill: 5, shellguard: 1, clawboss: 1, initiate: 1 },
      8
    );
    expect(errors).toEqual([]);
  });

  it('T-ROLE-032: valid 11-player distribution (2CB) passes', () => {
    const errors = validateDistribution(
      { krill: 7, shellguard: 1, clawboss: 2, initiate: 1 },
      11
    );
    expect(errors).toEqual([]);
  });

  it('T-ROLE-033: valid 12-player distribution (2Init) passes', () => {
    const errors = validateDistribution(
      { krill: 6, shellguard: 2, clawboss: 2, initiate: 2 },
      12
    );
    expect(errors).toEqual([]);
  });

  it('T-ROLE-034: wrong total fails', () => {
    const errors = validateDistribution(
      { krill: 5, shellguard: 1, clawboss: 1, initiate: 1 },
      7
    );
    expect(errors.some((e) => e.includes("doesn't match"))).toBe(true);
  });

  it('T-ROLE-035: Initiate at 6 players fails', () => {
    const errors = validateDistribution(
      { krill: 4, shellguard: 0, clawboss: 1, initiate: 1 },
      6
    );
    expect(errors.some((e) => e.includes('0 Initiate at 6'))).toBe(true);
  });

  it('T-ROLE-036: 1 Clawboss at 11 players fails', () => {
    const errors = validateDistribution(
      { krill: 8, shellguard: 1, clawboss: 1, initiate: 1 },
      11
    );
    expect(errors.some((e) => e.includes('2 Clawboss'))).toBe(true);
  });

  it('T-ROLE-037: below min players fails', () => {
    const errors = validateDistribution(
      { krill: 2, shellguard: 0, clawboss: 1, initiate: 0 },
      3
    );
    expect(errors.some((e) => e.includes('below minimum'))).toBe(true);
  });

  it('T-ROLE-038: 10 players with 1 or 2 CB both valid', () => {
    const err1 = validateDistribution({ krill: 7, shellguard: 1, clawboss: 1, initiate: 1 }, 10);
    const err2 = validateDistribution({ krill: 6, shellguard: 1, clawboss: 2, initiate: 1 }, 10);
    expect(err1).toEqual([]);
    expect(err2).toEqual([]);
  });

  it('T-ROLE-039: 12 players with 1 or 2 Init both valid', () => {
    const err1 = validateDistribution({ krill: 7, shellguard: 2, clawboss: 2, initiate: 1 }, 12);
    const err2 = validateDistribution({ krill: 6, shellguard: 2, clawboss: 2, initiate: 2 }, 12);
    expect(err1).toEqual([]);
    expect(err2).toEqual([]);
  });
});
