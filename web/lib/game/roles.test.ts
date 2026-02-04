import { describe, it, expect } from 'vitest';
import { getRoleDistribution, assignRoles, validateDistribution } from './roles';
import { MIN_PLAYERS, MAX_PLAYERS } from './types';

describe('Role Distribution', () => {
  // ── Min 6 players enforced ──

  it('T-ROLE-001: rejects fewer than 6 players', () => {
    expect(() => getRoleDistribution(5)).toThrow(`fewer than ${MIN_PLAYERS}`);
    expect(() => getRoleDistribution(3)).toThrow(`fewer than ${MIN_PLAYERS}`);
    expect(() => getRoleDistribution(0)).toThrow(`fewer than ${MIN_PLAYERS}`);
  });

  it('T-ROLE-002: rejects more than 12 players', () => {
    expect(() => getRoleDistribution(13)).toThrow(`more than ${MAX_PLAYERS}`);
    expect(() => getRoleDistribution(100)).toThrow(`more than ${MAX_PLAYERS}`);
  });

  it('T-ROLE-003: 6 players — 4 Krill + 1 CB + 1 Initiate', () => {
    const dist = getRoleDistribution(6);
    expect(dist.clawboss).toBe(1);
    expect(dist.initiate).toBe(1);
    expect(dist.shellguard).toBe(0);
    expect(dist.krill).toBe(4);
  });

  it('T-ROLE-004: 7 players — 5 Krill + 1 CB + 1 Initiate', () => {
    const dist = getRoleDistribution(7);
    expect(dist.clawboss).toBe(1);
    expect(dist.initiate).toBe(1);
    expect(dist.shellguard).toBe(0);
    expect(dist.krill).toBe(5);
  });

  it('T-ROLE-005: 8 players — Shellguard enters, 5K + 1SG + 1CB + 1Init', () => {
    const dist = getRoleDistribution(8);
    expect(dist.clawboss).toBe(1);
    expect(dist.initiate).toBe(1);
    expect(dist.shellguard).toBe(1);
    expect(dist.krill).toBe(5);
  });

  it('T-ROLE-006: 10 players — 7K + 1SG + 1CB + 1Init', () => {
    const dist = getRoleDistribution(10);
    expect(dist.clawboss).toBe(1);
    expect(dist.initiate).toBe(1);
    expect(dist.shellguard).toBe(1);
    expect(dist.krill).toBe(7);
  });

  it('T-ROLE-007: 12 players — 2 Shellguards, 8K + 2SG + 1CB + 1Init', () => {
    const dist = getRoleDistribution(12);
    expect(dist.clawboss).toBe(1);
    expect(dist.initiate).toBe(1);
    expect(dist.shellguard).toBe(2);
    expect(dist.krill).toBe(8);
  });

  it('T-ROLE-008: always exactly 1 Clawboss for any valid count', () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      expect(getRoleDistribution(n).clawboss).toBe(1);
    }
  });

  it('T-ROLE-009: always exactly 1 Initiate (min 6 guarantees this)', () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      expect(getRoleDistribution(n).initiate).toBe(1);
    }
  });

  it('T-ROLE-010: total roles always equals player count', () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      const dist = getRoleDistribution(n);
      const total = dist.krill + dist.shellguard + dist.clawboss + dist.initiate;
      expect(total).toBe(n);
    }
  });

  it('T-ROLE-011: at least 1 Krill at every player count', () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      expect(getRoleDistribution(n).krill).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('Role Assignment (6 mock players)', () => {
  const ids = ['a0', 'a1', 'a2', 'a3', 'a4', 'a5'];

  it('T-ROLE-020: assigns correct roles to 6 player IDs', () => {
    const assignments = assignRoles(ids);
    expect(assignments.size).toBe(6);

    const roles = [...assignments.values()];
    expect(roles.filter((r) => r === 'clawboss').length).toBe(1);
    expect(roles.filter((r) => r === 'initiate').length).toBe(1);
    expect(roles.filter((r) => r === 'krill').length).toBe(4);
    expect(roles.filter((r) => r === 'shellguard').length).toBe(0);
  });

  it('T-ROLE-021: assigns correct roles to 8 players (includes Shellguard)', () => {
    const ids8 = ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'];
    const assignments = assignRoles(ids8);
    const roles = [...assignments.values()];

    expect(roles.filter((r) => r === 'clawboss').length).toBe(1);
    expect(roles.filter((r) => r === 'initiate').length).toBe(1);
    expect(roles.filter((r) => r === 'shellguard').length).toBe(1);
    expect(roles.filter((r) => r === 'krill').length).toBe(5);
  });

  it('T-ROLE-022: assignments are randomized (not always same mapping)', () => {
    const results = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const a = assignRoles(ids);
      results.add(a.get('a0')!);
    }
    expect(results.size).toBeGreaterThan(1);
  });
});

describe('Distribution Validation', () => {
  it('T-ROLE-030: valid 6-player distribution passes', () => {
    const errors = validateDistribution(
      { krill: 4, shellguard: 0, clawboss: 1, initiate: 1 },
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

  it('T-ROLE-032: wrong total fails', () => {
    const errors = validateDistribution(
      { krill: 5, shellguard: 1, clawboss: 1, initiate: 1 },
      7
    );
    expect(errors.some((e) => e.includes("doesn't match"))).toBe(true);
  });

  it('T-ROLE-033: multiple Clawboss fails', () => {
    const errors = validateDistribution(
      { krill: 3, shellguard: 1, clawboss: 2, initiate: 1 },
      7
    );
    expect(errors.some((e) => e.includes('exactly 1 Clawboss'))).toBe(true);
  });

  it('T-ROLE-034: missing Initiate fails', () => {
    const errors = validateDistribution(
      { krill: 5, shellguard: 1, clawboss: 1, initiate: 0 },
      7
    );
    expect(errors.some((e) => e.includes('exactly 1 Initiate'))).toBe(true);
  });

  it('T-ROLE-035: below min players fails', () => {
    const errors = validateDistribution(
      { krill: 2, shellguard: 0, clawboss: 1, initiate: 1 },
      4
    );
    expect(errors.some((e) => e.includes('below minimum'))).toBe(true);
  });
});
