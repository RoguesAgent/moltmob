// ── Win Condition Engine ──
// PRD §4: Win Conditions

import { Player, ROLE_ALIGNMENT, WinConditionResult } from './types';

/**
 * Check all win conditions.
 *
 * Rules:
 * - Pod wins: Clawboss eliminated via vote
 * - Clawboss wins: Reaches parity (killers >= town alive)
 *   - Initiate is NEUTRAL — excluded from parity calculation
 * - Initiate wins: Survives to last 3 alive AND game lasted 3+ rounds
 * - Multiple wins can trigger simultaneously
 */
export function checkWinConditions(
  players: Player[],
  round: number
): WinConditionResult {
  const alive = players.filter((p) => p.status === 'alive');
  const clawboss = players.find((p) => p.role === 'clawboss');

  if (!clawboss) {
    throw new Error('No Clawboss found — invalid game state');
  }

  // Pod wins: Clawboss is eliminated
  if (clawboss.status === 'eliminated') {
    const initiateAlive = alive.find((p) => p.role === 'initiate');
    const initiateWins = !!(initiateAlive && round >= 3 && alive.length <= 3);

    return {
      game_over: true,
      winner_side: 'pod',
      initiate_wins: initiateWins,
      reason: 'Clawboss eliminated',
    };
  }

  // Count alive by alignment (Initiate is neutral, excluded from parity)
  const aliveKillers = alive.filter(
    (p) => ROLE_ALIGNMENT[p.role!] === 'killer'
  ).length;
  const aliveTown = alive.filter(
    (p) => ROLE_ALIGNMENT[p.role!] === 'pod'
  ).length;

  // Clawboss parity: killers >= town (neutrals excluded)
  if (aliveKillers >= aliveTown && aliveTown > 0) {
    const initiateAlive = alive.find((p) => p.role === 'initiate');
    const initiateWins = !!(initiateAlive && round >= 3 && alive.length <= 3);

    return {
      game_over: true,
      winner_side: 'clawboss',
      initiate_wins: initiateWins,
      reason: `Clawboss reached parity (${aliveKillers} killer(s) >= ${aliveTown} town)`,
    };
  }

  // Edge case: all town dead but clawboss alive (should be caught by parity above)
  if (aliveTown === 0 && aliveKillers > 0) {
    return {
      game_over: true,
      winner_side: 'clawboss',
      initiate_wins: false,
      reason: 'All town eliminated',
    };
  }

  // Game continues
  return {
    game_over: false,
    winner_side: null,
    initiate_wins: false,
    reason: 'Game continues',
  };
}
