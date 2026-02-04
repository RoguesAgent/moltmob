import { describe, it, expect } from 'vitest';
import { resolveMolt, pickMoltOutcome, pickSwapRole, maxMoltsForGame } from './molt';
import { mockRoledPlayers, findByRole } from './test-helpers';
import { Role } from './types';

describe('pickMoltOutcome', () => {
  it('returns a valid outcome', () => {
    const outcomes = new Set<string>();
    // Run many times to hit all outcomes
    for (let i = 0; i < 200; i++) {
      outcomes.add(pickMoltOutcome());
    }
    expect(outcomes.has('role_swap')).toBe(true);
    expect(outcomes.has('upgrade_vote')).toBe(true);
    expect(outcomes.has('upgrade_immunity')).toBe(true);
    expect(outcomes.has('dud')).toBe(true);
  });

  it('is deterministic with fixed rng', () => {
    // rng returning 0 → first outcome (role_swap, weight 25)
    expect(pickMoltOutcome(() => 0)).toBe('role_swap');
    // rng returning 0.99 → last outcome (dud)
    expect(pickMoltOutcome(() => 0.99)).toBe('dud');
  });
});

describe('pickSwapRole', () => {
  it('never returns the same role', () => {
    const roles: Role[] = ['krill', 'shellguard', 'clawboss', 'initiate'];
    for (const role of roles) {
      for (let i = 0; i < 50; i++) {
        expect(pickSwapRole(role)).not.toBe(role);
      }
    }
  });

  it('returns valid roles', () => {
    const validRoles = new Set(['krill', 'shellguard', 'clawboss', 'initiate']);
    for (let i = 0; i < 100; i++) {
      expect(validRoles.has(pickSwapRole('krill'))).toBe(true);
    }
  });
});

describe('resolveMolt', () => {
  it('resolves a role swap', () => {
    const players = mockRoledPlayers({ count: 8 });
    const krill = findByRole(players, 'krill')!;

    // rng=0 → role_swap
    const result = resolveMolt(krill, players, 2, () => 0);
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe('role_swap');
    expect(result!.new_role).not.toBe('krill');
    expect(result!.old_role).toBe('krill');
    expect(result!.description).toContain('MOLTS');
  });

  it('resolves a dud', () => {
    const players = mockRoledPlayers({ count: 8 });
    const krill = findByRole(players, 'krill')!;

    // rng=0.99 → dud
    const result = resolveMolt(krill, players, 2, () => 0.99);
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe('dud');
    expect(result!.new_role).toBeNull();
  });

  it('resolves an upgrade_vote', () => {
    const players = mockRoledPlayers({ count: 8 });
    const krill = findByRole(players, 'krill')!;

    // rng=0.26 → upgrade_vote (after role_swap weight 25, next is upgrade_vote 25)
    const result = resolveMolt(krill, players, 2, () => 0.26);
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe('upgrade_vote');
    expect(result!.new_role).toBeNull();
  });

  it('returns null for dead players', () => {
    const players = mockRoledPlayers({ count: 8, eliminated: ['agent_0'] });
    const dead = players.find((p) => p.id === 'agent_0')!;

    const result = resolveMolt(dead, players, 2);
    expect(result).toBeNull();
  });

  it('returns null when no molts remaining', () => {
    const players = mockRoledPlayers({ count: 8 });
    const krill = findByRole(players, 'krill')!;

    const result = resolveMolt(krill, players, 0);
    expect(result).toBeNull();
  });

  it('returns null for player with no role', () => {
    const players = mockRoledPlayers({ count: 8 });
    const unroled = { ...players[0], role: null as any };

    const result = resolveMolt(unroled, players, 2);
    expect(result).toBeNull();
  });
});

describe('maxMoltsForGame', () => {
  it('returns 1 for small games (≤8)', () => {
    expect(maxMoltsForGame(6)).toBe(1);
    expect(maxMoltsForGame(7)).toBe(1);
    expect(maxMoltsForGame(8)).toBe(1);
  });

  it('returns 2 for large games (>8)', () => {
    expect(maxMoltsForGame(9)).toBe(2);
    expect(maxMoltsForGame(10)).toBe(2);
    expect(maxMoltsForGame(12)).toBe(2);
  });
});
