import { describe, it, expect } from 'vitest';
import { checkWinConditions } from './win';
import { mockRoledPlayers, pid, findByRole, findAllByRole } from './test-helpers';

describe('Win Conditions (6 players — no Initiate)', () => {
  // Standard 6-player: [0-4] Krill, [5] Clawboss

  it('T-WIN-001: Clawboss eliminated → Pod wins', () => {
    const players = mockRoledPlayers({ eliminated: [pid(5)] }); // CB eliminated
    const result = checkWinConditions(players, 2);

    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('pod');
    expect(result.reason).toContain('Clawboss eliminated');
  });

  it('T-WIN-002: Clawboss reaches parity → Clawboss wins', () => {
    const players = mockRoledPlayers({
      eliminated: [pid(0), pid(1), pid(2), pid(3)], // 4 krill dead, 1K + 1CB alive
    });
    const result = checkWinConditions(players, 4);

    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('clawboss');
    expect(result.reason).toContain('parity');
  });

  it('T-WIN-003: 2 town vs 1 killer → game continues', () => {
    const players = mockRoledPlayers({
      eliminated: [pid(0), pid(1), pid(2)],
    });
    // Alive: pid(3) Krill, pid(4) Krill, pid(5) CB → 2 town > 1 killer
    const result = checkWinConditions(players, 3);

    expect(result.game_over).toBe(false);
  });

  it('T-WIN-004: all 5 Krill alive vs Clawboss → game continues', () => {
    const players = mockRoledPlayers();
    const result = checkWinConditions(players, 1);

    expect(result.game_over).toBe(false);
  });

  it('T-WIN-005: all town dead → Clawboss wins', () => {
    const players = mockRoledPlayers({
      eliminated: [pid(0), pid(1), pid(2), pid(3), pid(4)],
    });
    const result = checkWinConditions(players, 5);

    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('clawboss');
  });
});

describe('Win Conditions (7 players — with Initiate)', () => {
  // 7-player: [0-4] Krill, [5] Clawboss, [6] Initiate

  it('T-WIN-010: Initiate is NEUTRAL — excluded from parity calc', () => {
    const players = mockRoledPlayers({ count: 7 });
    // Kill krill until: 1 Krill + 1 CB + 1 Initiate alive
    players[0].status = 'eliminated';
    players[1].status = 'eliminated';
    players[2].status = 'eliminated';
    players[3].status = 'eliminated';
    // Alive: pid(4) Krill, pid(5) CB, pid(6) Initiate
    // Parity: 1 killer >= 1 town → CB wins (Initiate excluded)
    const result = checkWinConditions(players, 4);

    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('clawboss');
  });

  it('T-WIN-011: Initiate wins when alive at game end + round >= 3 + <= 3 alive', () => {
    const players = mockRoledPlayers({ count: 7 });
    // Kill krill + CB: leave 1 Krill + Initiate
    players[0].status = 'eliminated';
    players[1].status = 'eliminated';
    players[2].status = 'eliminated';
    players[3].status = 'eliminated';
    players[5].status = 'eliminated'; // CB dead
    // Alive: pid(4) Krill, pid(6) Initiate = 2 alive
    const result = checkWinConditions(players, 4);

    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('pod');
    expect(result.initiate_wins).toBe(true);
  });

  it('T-WIN-012: Initiate does NOT win if round < 3', () => {
    const players = mockRoledPlayers({ count: 7 });
    players[0].status = 'eliminated';
    players[1].status = 'eliminated';
    players[2].status = 'eliminated';
    players[3].status = 'eliminated';
    players[5].status = 'eliminated'; // CB dead
    // 2 alive, but round 2 < 3
    const result = checkWinConditions(players, 2);

    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('pod');
    expect(result.initiate_wins).toBe(false);
  });

  it('T-WIN-013: Initiate does NOT win if > 3 alive', () => {
    const players = mockRoledPlayers({ count: 7 });
    players[5].status = 'eliminated'; // only CB dead
    // 5 Krill + 1 Initiate = 6 alive > 3
    const result = checkWinConditions(players, 4);

    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('pod');
    expect(result.initiate_wins).toBe(false);
  });

  it('T-WIN-014: Initiate can win alongside Clawboss (parity)', () => {
    const players = mockRoledPlayers({ count: 7 });
    // Kill until: 1 Krill + CB + Initiate alive (3 alive)
    players[0].status = 'eliminated';
    players[1].status = 'eliminated';
    players[2].status = 'eliminated';
    players[3].status = 'eliminated';
    // Alive: pid(4) Krill, pid(5) CB, pid(6) Initiate
    // Parity → CB wins. Initiate alive + round 4 + 3 alive → Initiate also wins
    const result = checkWinConditions(players, 4);

    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('clawboss');
    expect(result.initiate_wins).toBe(true);
  });
});

describe('Win Conditions (11 players — 2 Clawboss)', () => {
  // 11-player: [0-6] Krill, [7] SG, [8] CB, [9] CB, [10] Initiate

  it('T-WIN-020: both Clawboss must die for Pod to win', () => {
    const players = mockRoledPlayers({ count: 11 });
    // Kill only 1 CB
    players[8].status = 'eliminated';
    const result = checkWinConditions(players, 3);

    // 1 CB still alive, 8 town alive → game continues
    expect(result.game_over).toBe(false);
  });

  it('T-WIN-021: both Clawboss eliminated → Pod wins', () => {
    const players = mockRoledPlayers({ count: 11 });
    players[8].status = 'eliminated';
    players[9].status = 'eliminated';
    const result = checkWinConditions(players, 4);

    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('pod');
  });

  it('T-WIN-022: 2 CB parity requires >= town alive', () => {
    const players = mockRoledPlayers({ count: 11 });
    // Kill until 2 town left vs 2 killers
    players[0].status = 'eliminated';
    players[1].status = 'eliminated';
    players[2].status = 'eliminated';
    players[3].status = 'eliminated';
    players[4].status = 'eliminated';
    players[5].status = 'eliminated';
    // Alive: pid(6) Krill, pid(7) SG, pid(8) CB, pid(9) CB, pid(10) Init
    // 2 town vs 2 killer → parity → CB wins
    const result = checkWinConditions(players, 6);

    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('clawboss');
  });
});
