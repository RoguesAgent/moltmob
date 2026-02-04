import { describe, it, expect } from 'vitest';
import {
  calculatePodWinPayouts,
  calculateClawbossWinPayouts,
  calculateInitiateBonus,
  calculateRake,
} from './payouts';
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

const ENTRY_FEE = 10_000_000; // 0.01 WSOL in lamports

describe('Rake Calculation', () => {
  it('T-PAY-001: 10% rake on 8 players', () => {
    const rake = calculateRake(8, ENTRY_FEE, 10);
    expect(rake).toBe(8_000_000); // 80M * 10% = 8M
  });

  it('T-PAY-002: rake is always integer (floor)', () => {
    const rake = calculateRake(3, 7_777_777, 10);
    expect(Number.isInteger(rake)).toBe(true);
  });
});

describe('Pod Win Payouts', () => {
  // ── PRD §10.1 ──

  it('T-PAY-010: correct voters get 60% bounty', () => {
    const players: Player[] = [
      makePlayer({ id: 'p1', role: 'krill' }),
      makePlayer({ id: 'p2', role: 'krill' }),
      makePlayer({ id: 'p3', role: 'shellguard' }),
      makePlayer({ id: 'p4', role: 'clawboss', status: 'eliminated', eliminated_by: 'cooked' }),
    ];

    const payouts = calculatePodWinPayouts(players, ENTRY_FEE, ['p1', 'p2'], 10);
    const totalPool = ENTRY_FEE * 4; // 40M
    const distributable = totalPool - totalPool * 0.1; // 36M
    const bountyPool = Math.floor(distributable * 0.6); // 21.6M

    // p1 and p2 are correct voters
    const p1Payout = payouts.find((p) => p.player_id === 'p1');
    const p2Payout = payouts.find((p) => p.player_id === 'p2');
    expect(p1Payout).toBeDefined();
    expect(p2Payout).toBeDefined();

    // Each correct voter gets bountyPool / 2 + survivalPool share
    const bountyPerVoter = Math.floor(bountyPool / 2);
    expect(p1Payout!.amount).toBeGreaterThanOrEqual(bountyPerVoter);
  });

  it('T-PAY-011: alive town agents get survival bonus', () => {
    const players: Player[] = [
      makePlayer({ id: 'p1', role: 'krill' }),
      makePlayer({ id: 'p2', role: 'krill', status: 'eliminated', eliminated_by: 'pinched' }),
      makePlayer({ id: 'p3', role: 'shellguard' }),
      makePlayer({ id: 'p4', role: 'clawboss', status: 'eliminated', eliminated_by: 'cooked' }),
    ];

    const payouts = calculatePodWinPayouts(players, ENTRY_FEE, ['p1', 'p3'], 10);

    // p2 is dead — should NOT get survival bonus
    const p2Payout = payouts.find((p) => p.player_id === 'p2');
    expect(p2Payout).toBeUndefined(); // dead, didn't vote correctly

    // p1 and p3 are alive town — get survival
    const p1 = payouts.find((p) => p.player_id === 'p1');
    const p3 = payouts.find((p) => p.player_id === 'p3');
    expect(p1).toBeDefined();
    expect(p3).toBeDefined();
  });

  it('T-PAY-012: Clawboss cannot claim bounty even if they voted for themselves', () => {
    const players: Player[] = [
      makePlayer({ id: 'p1', role: 'krill' }),
      makePlayer({ id: 'p2', role: 'krill' }),
      makePlayer({ id: 'p3', role: 'clawboss', status: 'eliminated', eliminated_by: 'cooked' }),
    ];

    // Even if clawboss ID is in voter list (shouldn't happen, but guard against)
    const payouts = calculatePodWinPayouts(players, ENTRY_FEE, ['p1', 'p2', 'p3'], 10);
    const cbPayout = payouts.find((p) => p.player_id === 'p3');
    expect(cbPayout).toBeUndefined(); // Clawboss excluded
  });

  it('T-PAY-013: total payouts + rake = total pool', () => {
    const players: Player[] = [
      makePlayer({ id: 'p1', role: 'krill' }),
      makePlayer({ id: 'p2', role: 'krill' }),
      makePlayer({ id: 'p3', role: 'shellguard' }),
      makePlayer({ id: 'p4', role: 'clawboss', status: 'eliminated', eliminated_by: 'cooked' }),
    ];

    const payouts = calculatePodWinPayouts(players, ENTRY_FEE, ['p1', 'p2'], 10);
    const totalPaid = payouts.reduce((sum, p) => sum + p.amount, 0);
    const rake = calculateRake(4, ENTRY_FEE, 10);
    const totalPool = ENTRY_FEE * 4;

    // Allow small rounding difference (floor division)
    expect(totalPaid + rake).toBeLessThanOrEqual(totalPool);
    expect(totalPaid + rake).toBeGreaterThan(totalPool * 0.98); // within 2%
  });
});

describe('Clawboss Win Payouts', () => {
  // ── PRD §10.2 ──

  it('T-PAY-020: Clawboss gets 90% of pool', () => {
    const players: Player[] = [
      makePlayer({ id: 'p1', role: 'krill', status: 'eliminated' }),
      makePlayer({ id: 'p2', role: 'krill' }),
      makePlayer({ id: 'p3', role: 'clawboss' }),
    ];

    const payouts = calculateClawbossWinPayouts(players, ENTRY_FEE, 10);
    const totalPool = ENTRY_FEE * 3; // 30M
    const expected = totalPool - Math.floor(totalPool * 0.1); // 27M

    expect(payouts).toHaveLength(1);
    expect(payouts[0].player_id).toBe('p3');
    expect(payouts[0].reason).toBe('clawboss_win');
    expect(payouts[0].amount).toBe(expected);
  });

  it('T-PAY-021: throws if no Clawboss found', () => {
    const players: Player[] = [
      makePlayer({ id: 'p1', role: 'krill' }),
      makePlayer({ id: 'p2', role: 'krill' }),
    ];
    expect(() => calculateClawbossWinPayouts(players, ENTRY_FEE)).toThrow('No Clawboss');
  });
});

describe('Initiate Bonus', () => {
  // ── PRD §10.3 ──

  it('T-PAY-030: alive initiate gets refund + bonus', () => {
    const players: Player[] = [
      makePlayer({ id: 'p1', role: 'krill' }),
      makePlayer({ id: 'p2', role: 'initiate' }),
      makePlayer({ id: 'p3', role: 'clawboss', status: 'eliminated' }),
    ];

    const bonus = calculateInitiateBonus(players, ENTRY_FEE, 5);
    expect(bonus).not.toBeNull();
    expect(bonus!.player_id).toBe('p2');
    expect(bonus!.reason).toBe('initiate_win');
    expect(bonus!.amount).toBeGreaterThan(ENTRY_FEE); // refund + bonus
  });

  it('T-PAY-031: dead initiate gets nothing', () => {
    const players: Player[] = [
      makePlayer({ id: 'p1', role: 'krill' }),
      makePlayer({ id: 'p2', role: 'initiate', status: 'eliminated' }),
      makePlayer({ id: 'p3', role: 'clawboss', status: 'eliminated' }),
    ];

    const bonus = calculateInitiateBonus(players, ENTRY_FEE, 5);
    expect(bonus).toBeNull();
  });

  it('T-PAY-032: no initiate in game returns null', () => {
    const players: Player[] = [
      makePlayer({ id: 'p1', role: 'krill' }),
      makePlayer({ id: 'p2', role: 'krill' }),
      makePlayer({ id: 'p3', role: 'clawboss' }),
    ];

    const bonus = calculateInitiateBonus(players, ENTRY_FEE, 5);
    expect(bonus).toBeNull();
  });
});
