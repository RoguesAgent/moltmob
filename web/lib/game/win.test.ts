import { describe, it, expect } from 'vitest';
import { checkWinConditions } from './win';
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

describe('Win Conditions', () => {
  // ── PRD §4: Win Conditions ──

  it('T-WIN-001: Clawboss eliminated → Pod wins', () => {
    const players: Player[] = [
      makePlayer({ id: 'p1', role: 'krill' }),
      makePlayer({ id: 'p2', role: 'krill' }),
      makePlayer({ id: 'p3', role: 'clawboss', status: 'eliminated', eliminated_by: 'cooked' }),
    ];
    const result = checkWinConditions(players, 2);
    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('pod');
    expect(result.reason).toContain('Clawboss eliminated');
  });

  it('T-WIN-002: Clawboss reaches parity → Clawboss wins (1v1)', () => {
    const players: Player[] = [
      makePlayer({ id: 'p1', role: 'krill' }),
      makePlayer({ id: 'p2', role: 'clawboss' }),
      makePlayer({ id: 'p3', role: 'krill', status: 'eliminated', eliminated_by: 'pinched' }),
    ];
    const result = checkWinConditions(players, 2);
    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('clawboss');
    expect(result.reason).toContain('parity');
  });

  it('T-WIN-003: Initiate is NEUTRAL — excluded from parity calc', () => {
    // 1 Clawboss + 1 Krill + 1 Initiate alive
    // Parity: 1 killer vs 1 town → parity reached → Clawboss wins
    // Initiate should NOT count as town
    const players: Player[] = [
      makePlayer({ id: 'p1', role: 'krill' }),
      makePlayer({ id: 'p2', role: 'clawboss' }),
      makePlayer({ id: 'p3', role: 'initiate' }),
      makePlayer({ id: 'p4', role: 'krill', status: 'eliminated', eliminated_by: 'pinched' }),
    ];
    const result = checkWinConditions(players, 3);
    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('clawboss');
  });

  it('T-WIN-004: 2 town vs 1 killer → game continues', () => {
    const players: Player[] = [
      makePlayer({ id: 'p1', role: 'krill' }),
      makePlayer({ id: 'p2', role: 'krill' }),
      makePlayer({ id: 'p3', role: 'clawboss' }),
    ];
    const result = checkWinConditions(players, 2);
    expect(result.game_over).toBe(false);
    expect(result.winner_side).toBeNull();
  });

  it('T-WIN-005: 3 town + 1 initiate vs 1 killer → game continues', () => {
    const players: Player[] = [
      makePlayer({ id: 'p1', role: 'krill' }),
      makePlayer({ id: 'p2', role: 'krill' }),
      makePlayer({ id: 'p3', role: 'krill' }),
      makePlayer({ id: 'p4', role: 'initiate' }),
      makePlayer({ id: 'p5', role: 'clawboss' }),
    ];
    const result = checkWinConditions(players, 2);
    expect(result.game_over).toBe(false);
  });

  it('T-WIN-006: Initiate wins when alive at game end + round >= 3 + <= 3 alive', () => {
    // Clawboss eliminated at round 4, initiate still alive, 3 remaining
    const players: Player[] = [
      makePlayer({ id: 'p1', role: 'krill' }),
      makePlayer({ id: 'p2', role: 'initiate' }),
      makePlayer({ id: 'p3', role: 'clawboss', status: 'eliminated', eliminated_by: 'cooked' }),
      makePlayer({ id: 'p4', role: 'krill', status: 'eliminated', eliminated_by: 'pinched' }),
    ];
    const result = checkWinConditions(players, 4);
    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('pod');
    expect(result.initiate_wins).toBe(true);
  });

  it('T-WIN-007: Initiate does NOT win if round < 3', () => {
    const players: Player[] = [
      makePlayer({ id: 'p1', role: 'krill' }),
      makePlayer({ id: 'p2', role: 'initiate' }),
      makePlayer({ id: 'p3', role: 'clawboss', status: 'eliminated', eliminated_by: 'cooked' }),
    ];
    const result = checkWinConditions(players, 2);
    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('pod');
    expect(result.initiate_wins).toBe(false); // round 2 < 3
  });

  it('T-WIN-008: Initiate does NOT win if > 3 alive', () => {
    const players: Player[] = [
      makePlayer({ id: 'p1', role: 'krill' }),
      makePlayer({ id: 'p2', role: 'krill' }),
      makePlayer({ id: 'p3', role: 'initiate' }),
      makePlayer({ id: 'p4', role: 'shellguard' }),
      makePlayer({ id: 'p5', role: 'clawboss', status: 'eliminated', eliminated_by: 'cooked' }),
    ];
    const result = checkWinConditions(players, 4);
    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('pod');
    expect(result.initiate_wins).toBe(false); // 4 alive > 3
  });

  it('T-WIN-009: Initiate can win alongside Clawboss (parity)', () => {
    // Clawboss reaches parity, but Initiate is alive at last 3 in round 4
    const players: Player[] = [
      makePlayer({ id: 'p1', role: 'krill' }),
      makePlayer({ id: 'p2', role: 'clawboss' }),
      makePlayer({ id: 'p3', role: 'initiate' }),
      makePlayer({ id: 'p4', role: 'krill', status: 'eliminated', eliminated_by: 'pinched' }),
      makePlayer({ id: 'p5', role: 'krill', status: 'eliminated', eliminated_by: 'cooked' }),
    ];
    const result = checkWinConditions(players, 4);
    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('clawboss');
    expect(result.initiate_wins).toBe(true); // both win simultaneously
  });

  it('T-WIN-010: all town dead → Clawboss wins', () => {
    const players: Player[] = [
      makePlayer({ id: 'p1', role: 'krill', status: 'eliminated', eliminated_by: 'pinched' }),
      makePlayer({ id: 'p2', role: 'krill', status: 'eliminated', eliminated_by: 'cooked' }),
      makePlayer({ id: 'p3', role: 'clawboss' }),
    ];
    const result = checkWinConditions(players, 3);
    expect(result.game_over).toBe(true);
    expect(result.winner_side).toBe('clawboss');
  });

  it('T-WIN-011: no Clawboss in players throws error', () => {
    const players: Player[] = [
      makePlayer({ id: 'p1', role: 'krill' }),
      makePlayer({ id: 'p2', role: 'krill' }),
    ];
    expect(() => checkWinConditions(players, 1)).toThrow('No Clawboss');
  });
});
