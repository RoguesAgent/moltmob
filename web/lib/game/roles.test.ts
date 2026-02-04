import { describe, it, expect } from 'vitest';
import { getRoleDistribution, assignRoles, validateDistribution } from './roles';

describe('Role Distribution', () => {
  // ── PRD §3.2 Distribution Table ──

  it('T-ROLE-001: rejects fewer than 3 players', () => {
    expect(() => getRoleDistribution(2)).toThrow('fewer than 3');
    expect(() => getRoleDistribution(0)).toThrow('fewer than 3');
    expect(() => getRoleDistribution(-1)).toThrow('fewer than 3');
  });

  it('T-ROLE-002: rejects more than 12 players', () => {
    expect(() => getRoleDistribution(13)).toThrow('more than 12');
    expect(() => getRoleDistribution(100)).toThrow('more than 12');
  });

  it('T-ROLE-003: 3 players — 2 Krill + 1 Clawboss, NO Initiate', () => {
    const dist = getRoleDistribution(3);
    expect(dist.clawboss).toBe(1);
    expect(dist.initiate).toBe(0); // Initiate only at 6+
    expect(dist.shellguard).toBe(0);
    expect(dist.krill).toBe(2);
  });

  it('T-ROLE-004: 4 players — 3 Krill + 1 Clawboss, NO Initiate', () => {
    const dist = getRoleDistribution(4);
    expect(dist.clawboss).toBe(1);
    expect(dist.initiate).toBe(0);
    expect(dist.shellguard).toBe(0);
    expect(dist.krill).toBe(3);
  });

  it('T-ROLE-005: 5 players — 4 Krill + 1 Clawboss, NO Initiate', () => {
    const dist = getRoleDistribution(5);
    expect(dist.clawboss).toBe(1);
    expect(dist.initiate).toBe(0);
    expect(dist.shellguard).toBe(0);
    expect(dist.krill).toBe(4);
  });

  it('T-ROLE-006: 6 players — Initiate enters, 4 Krill + 1 CB + 1 Init', () => {
    const dist = getRoleDistribution(6);
    expect(dist.clawboss).toBe(1);
    expect(dist.initiate).toBe(1);
    expect(dist.shellguard).toBe(0);
    expect(dist.krill).toBe(4);
  });

  it('T-ROLE-007: 8 players — Shellguard enters, 5K + 1SG + 1CB + 1Init', () => {
    const dist = getRoleDistribution(8);
    expect(dist.clawboss).toBe(1);
    expect(dist.initiate).toBe(1);
    expect(dist.shellguard).toBe(1);
    expect(dist.krill).toBe(5);
  });

  it('T-ROLE-008: 10 players — 7K + 1SG + 1CB + 1Init', () => {
    const dist = getRoleDistribution(10);
    expect(dist.clawboss).toBe(1);
    expect(dist.initiate).toBe(1);
    expect(dist.shellguard).toBe(1);
    expect(dist.krill).toBe(7);
  });

  it('T-ROLE-009: 12 players — 2 Shellguards, 8K + 2SG + 1CB + 1Init', () => {
    const dist = getRoleDistribution(12);
    expect(dist.clawboss).toBe(1);
    expect(dist.initiate).toBe(1);
    expect(dist.shellguard).toBe(2);
    expect(dist.krill).toBe(8);
  });

  it('T-ROLE-010: always exactly 1 Clawboss for any valid count', () => {
    for (let n = 3; n <= 12; n++) {
      const dist = getRoleDistribution(n);
      expect(dist.clawboss).toBe(1);
    }
  });

  it('T-ROLE-011: Initiate is 0 below 6, exactly 1 at 6+', () => {
    for (let n = 3; n <= 5; n++) {
      expect(getRoleDistribution(n).initiate).toBe(0);
    }
    for (let n = 6; n <= 12; n++) {
      expect(getRoleDistribution(n).initiate).toBe(1);
    }
  });

  it('T-ROLE-012: total roles always equals player count', () => {
    for (let n = 3; n <= 12; n++) {
      const dist = getRoleDistribution(n);
      const total = dist.krill + dist.shellguard + dist.clawboss + dist.initiate;
      expect(total).toBe(n);
    }
  });

  it('T-ROLE-013: at least 1 Krill at every player count', () => {
    for (let n = 3; n <= 12; n++) {
      expect(getRoleDistribution(n).krill).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('Role Assignment', () => {
  it('T-ROLE-020: assigns correct roles to player IDs', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    const assignments = assignRoles(ids);

    expect(assignments.size).toBe(8);

    // Count roles
    const roles = [...assignments.values()];
    expect(roles.filter((r) => r === 'clawboss').length).toBe(1);
    expect(roles.filter((r) => r === 'initiate').length).toBe(1);
    expect(roles.filter((r) => r === 'shellguard').length).toBe(1);
    expect(roles.filter((r) => r === 'krill').length).toBe(5);
  });

  it('T-ROLE-021: assignments are randomized (not always same mapping)', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    const results = new Set<string>();

    for (let i = 0; i < 20; i++) {
      const a = assignRoles(ids);
      results.add(a.get('p1')!);
    }

    // Should see more than 1 different role for p1 across 20 runs
    expect(results.size).toBeGreaterThan(1);
  });

  it('T-ROLE-022: 3-player assignment has no Initiate', () => {
    const ids = ['a', 'b', 'c'];
    const assignments = assignRoles(ids);
    const roles = [...assignments.values()];

    expect(roles.filter((r) => r === 'clawboss').length).toBe(1);
    expect(roles.filter((r) => r === 'initiate').length).toBe(0);
    expect(roles.filter((r) => r === 'krill').length).toBe(2);
  });
});

describe('Distribution Validation', () => {
  it('T-ROLE-030: valid distribution passes', () => {
    const errors = validateDistribution(
      { krill: 5, shellguard: 1, clawboss: 1, initiate: 1 },
      8
    );
    expect(errors).toEqual([]);
  });

  it('T-ROLE-031: wrong total fails', () => {
    const errors = validateDistribution(
      { krill: 5, shellguard: 1, clawboss: 1, initiate: 1 },
      7 // should be 8
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('doesn\'t match');
  });

  it('T-ROLE-032: multiple Clawboss fails', () => {
    const errors = validateDistribution(
      { krill: 4, shellguard: 1, clawboss: 2, initiate: 1 },
      8
    );
    expect(errors.some((e) => e.includes('exactly 1 Clawboss'))).toBe(true);
  });

  it('T-ROLE-033: Initiate below 6 players fails', () => {
    const errors = validateDistribution(
      { krill: 2, shellguard: 0, clawboss: 1, initiate: 1 },
      4
    );
    expect(errors.some((e) => e.includes('should not exist below 6'))).toBe(true);
  });

  it('T-ROLE-034: no Initiate at 6+ fails', () => {
    const errors = validateDistribution(
      { krill: 5, shellguard: 1, clawboss: 1, initiate: 0 },
      7 // 7 players, should have initiate
    );
    expect(errors.some((e) => e.includes('exactly 1 Initiate at 6+'))).toBe(true);
  });
});
