import { describe, it, expect } from 'vitest';
import {
  calculatePodWinPayouts,
  calculateClawbossWinPayouts,
  calculateInitiateBonus,
  calculateRake,
} from './payouts';
import { mockRoledPlayers, pid } from './test-helpers';

const ENTRY_FEE = 10_000_000; // 0.01 SOL

describe('Rake Calculation', () => {
  it('T-PAY-001: 10% rake on 6 players', () => {
    const rake = calculateRake(6, ENTRY_FEE, 10);
    expect(rake).toBe(6_000_000);
  });

  it('T-PAY-002: rake is always integer (floor)', () => {
    const rake = calculateRake(7, 7_777_777, 10);
    expect(Number.isInteger(rake)).toBe(true);
  });
});

describe('Pod Win Payouts (6 players — no Initiate)', () => {
  // 6-player: [0-4] Krill, [5] Clawboss

  it('T-PAY-010: correct voters get 60% bounty', () => {
    const players = mockRoledPlayers({ eliminated: [pid(5)] }); // CB eliminated

    const payouts = calculatePodWinPayouts(
      players,
      ENTRY_FEE,
      [pid(0), pid(1), pid(2)],
      10
    );

    const totalPool = ENTRY_FEE * 6;
    const distributable = totalPool - Math.floor(totalPool * 0.1);
    const bountyPool = Math.floor(distributable * 0.6);
    const bountyPerVoter = Math.floor(bountyPool / 3);

    const p0 = payouts.find((p) => p.player_id === pid(0));
    expect(p0).toBeDefined();
    expect(p0!.amount).toBeGreaterThanOrEqual(bountyPerVoter);
  });

  it('T-PAY-011: alive town agents get survival bonus', () => {
    const players = mockRoledPlayers({ eliminated: [pid(0), pid(5)] }); // krill0 + CB dead

    const payouts = calculatePodWinPayouts(
      players,
      ENTRY_FEE,
      [pid(1), pid(2)],
      10
    );

    // pid(0) is dead — should NOT get survival
    expect(payouts.find((p) => p.player_id === pid(0))).toBeUndefined();

    // pid(1) and pid(3) alive town — get something
    expect(payouts.find((p) => p.player_id === pid(1))).toBeDefined();
    expect(payouts.find((p) => p.player_id === pid(3))).toBeDefined();
  });

  it('T-PAY-012: Clawboss cannot claim bounty', () => {
    const players = mockRoledPlayers({ eliminated: [pid(5)] });

    const payouts = calculatePodWinPayouts(
      players,
      ENTRY_FEE,
      [pid(0), pid(5)], // CB in list
      10
    );

    expect(payouts.find((p) => p.player_id === pid(5))).toBeUndefined();
  });

  it('T-PAY-013: total payouts + rake ≈ total pool', () => {
    const players = mockRoledPlayers({ eliminated: [pid(5)] });

    const payouts = calculatePodWinPayouts(
      players,
      ENTRY_FEE,
      [pid(0), pid(1), pid(2)],
      10
    );

    const totalPaid = payouts.reduce((sum, p) => sum + p.amount, 0);
    const rake = calculateRake(6, ENTRY_FEE, 10);
    const totalPool = ENTRY_FEE * 6;

    expect(totalPaid + rake).toBeLessThanOrEqual(totalPool);
    expect(totalPaid + rake).toBeGreaterThan(totalPool * 0.98);
  });
});

describe('Clawboss Win Payouts (6 players)', () => {
  it('T-PAY-020: Clawboss gets 90% of pool', () => {
    const players = mockRoledPlayers({
      eliminated: [pid(0), pid(1), pid(2), pid(3)],
    });

    const payouts = calculateClawbossWinPayouts(players, ENTRY_FEE, 10);
    const totalPool = ENTRY_FEE * 6;
    const expected = totalPool - Math.floor(totalPool * 0.1);

    expect(payouts).toHaveLength(1);
    expect(payouts[0].player_id).toBe(pid(5)); // clawboss at index 5
    expect(payouts[0].reason).toBe('clawboss_win');
    expect(payouts[0].amount).toBe(expected);
  });
});

describe('Initiate Bonus (7 players — has Initiate)', () => {
  // 7-player: [0-4] Krill, [5] Clawboss, [6] Initiate

  it('T-PAY-030: alive initiate gets refund + bonus', () => {
    const players = mockRoledPlayers({ count: 7, eliminated: [pid(5)] }); // CB dead

    const bonus = calculateInitiateBonus(players, ENTRY_FEE, 5);
    expect(bonus).not.toBeNull();
    expect(bonus!.player_id).toBe(pid(6)); // initiate
    expect(bonus!.reason).toBe('initiate_win');
    expect(bonus!.amount).toBeGreaterThan(ENTRY_FEE);
  });

  it('T-PAY-031: dead initiate gets nothing', () => {
    const players = mockRoledPlayers({ count: 7, eliminated: [pid(5), pid(6)] });

    const bonus = calculateInitiateBonus(players, ENTRY_FEE, 5);
    expect(bonus).toBeNull();
  });

  it('T-PAY-032: 6-player game has no initiate → null', () => {
    const players = mockRoledPlayers(); // 6 players, no initiate
    const bonus = calculateInitiateBonus(players, ENTRY_FEE, 5);
    expect(bonus).toBeNull();
  });
});
