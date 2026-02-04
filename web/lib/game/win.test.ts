import { describe, it, expect } from 'vitest';
import { checkWinConditions } from './win';
import { mockRoledPlayers, pid } from './test-helpers';

describe('Win Conditions (6+ players)', () => {
  // Standard 6-player: [0-3] Krill, [4] Clawboss, [5] Initiate

  it('T-WIN-001: Clawboss eliminated → Pod wins', () => {
    const players = mockRoledPlayers({ eliminated: [pid(4)] }); // CB eliminated
    const result = checkWinConditions(players, 2);

    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('pod');
    expect(result.reason).toContain('Clawboss eliminated');
  });

  it('T-WIN-002: Clawboss reaches parity → Clawboss wins', () => {
    // Kill off krill until 1 town left vs 1 killer
    const players = mockRoledPlayers({
      eliminated: [pid(0), pid(1), pid(2)], // 3 krill dead
    });
    // Alive: pid(3) Krill, pid(4) Clawboss, pid(5) Initiate
    // Parity: 1 killer >= 1 town (Initiate is neutral, excluded)
    const result = checkWinConditions(players, 4);

    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('clawboss');
    expect(result.reason).toContain('parity');
  });

  it('T-WIN-003: Initiate is NEUTRAL — excluded from parity calc', () => {
    const players = mockRoledPlayers({
      eliminated: [pid(0), pid(1), pid(2)],
    });
    // 1 Krill + 1 CB + 1 Initiate alive
    // Parity check: 1 killer >= 1 town → CB wins
    // Initiate does NOT count as town
    const result = checkWinConditions(players, 3);

    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('clawboss');
  });

  it('T-WIN-004: 2 town vs 1 killer → game continues', () => {
    const players = mockRoledPlayers({
      eliminated: [pid(0), pid(1)],
    });
    // Alive: pid(2) Krill, pid(3) Krill, pid(4) CB, pid(5) Init
    // 2 town > 1 killer → game continues
    const result = checkWinConditions(players, 3);

    expect(result.game_over).toBe(false);
    expect(result.winner_side).toBeNull();
  });

  it('T-WIN-005: all 4 Krill alive vs Clawboss → game continues', () => {
    const players = mockRoledPlayers(); // nobody eliminated
    const result = checkWinConditions(players, 1);

    expect(result.game_over).toBe(false);
  });

  it('T-WIN-006: Initiate wins when alive at game end + round >= 3 + <= 3 alive', () => {
    const players = mockRoledPlayers({
      eliminated: [pid(0), pid(1), pid(2), pid(4)], // 3 krill + CB dead
    });
    // Alive: pid(3) Krill, pid(5) Initiate (2 alive)
    const result = checkWinConditions(players, 4);

    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('pod'); // CB eliminated
    expect(result.initiate_wins).toBe(true);
  });

  it('T-WIN-007: Initiate does NOT win if round < 3', () => {
    const players = mockRoledPlayers({
      eliminated: [pid(0), pid(1), pid(2), pid(4)],
    });
    const result = checkWinConditions(players, 2);

    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('pod');
    expect(result.initiate_wins).toBe(false); // round 2 < 3
  });

  it('T-WIN-008: Initiate does NOT win if > 3 alive', () => {
    const players = mockRoledPlayers({
      eliminated: [pid(4)], // only CB eliminated
    });
    // Alive: 4 Krill + 1 Initiate = 5 alive > 3
    const result = checkWinConditions(players, 4);

    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('pod');
    expect(result.initiate_wins).toBe(false);
  });

  it('T-WIN-009: Initiate can win alongside Clawboss (parity)', () => {
    const players = mockRoledPlayers({
      eliminated: [pid(0), pid(1), pid(2)],
    });
    // Alive: pid(3) Krill, pid(4) CB, pid(5) Initiate = 3 alive
    // Parity: 1 killer >= 1 town → CB wins
    // Initiate alive + round 4 + 3 alive → Initiate also wins
    const result = checkWinConditions(players, 4);

    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('clawboss');
    expect(result.initiate_wins).toBe(true);
  });

  it('T-WIN-010: all town dead → Clawboss wins', () => {
    const players = mockRoledPlayers({
      eliminated: [pid(0), pid(1), pid(2), pid(3)], // all krill dead
    });
    // Alive: pid(4) CB, pid(5) Initiate
    const result = checkWinConditions(players, 5);

    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('clawboss');
  });
});

describe('Win Condition Edge Cases', () => {
  it('T-WIN-020: 8-player game — Shellguard counts as town', () => {
    const players = mockRoledPlayers({ count: 8 });
    // 8-player: [0-4] Krill, [5] Shellguard, [6] CB, [7] Initiate
    // All alive: 6 town vs 1 killer → game continues
    const result = checkWinConditions(players, 1);

    expect(result.game_over).toBe(false);
  });

  it('T-WIN-021: 8-player — CB parity requires beating town+shellguard', () => {
    const players = mockRoledPlayers({ count: 8 });
    // Kill most town: leave Shellguard + 1 Krill
    players[0].status = 'eliminated'; // krill
    players[1].status = 'eliminated';
    players[2].status = 'eliminated';
    players[3].status = 'eliminated';
    // Alive: pid(4) Krill, pid(5) Shellguard, pid(6) CB, pid(7) Initiate
    // 2 town vs 1 killer → game continues
    const result = checkWinConditions(players, 5);

    expect(result.game_over).toBe(false);
  });
});
