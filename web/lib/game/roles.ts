// ── Role Assignment Engine ──
// PRD §3.2: Distribution Table (updated Feb 4)
//
// Players | Clawboss | Initiate | Shellguard | Krill
// --------|----------|----------|------------|------
//   6     |    1     |    0     |     0      |  5
//   7     |    1     |    1     |     0      |  5
//   8     |    1     |    1     |     1      |  5
//   9     |    1     |    1     |     1      |  6
//  10     |   1-2    |    1     |     1      | 5-6
//  11     |    2     |    1     |     1      |  7
//  12     |    2     |   1-2    |     2      | 6-7

import { Role, RoleDistribution, MIN_PLAYERS, MAX_PLAYERS } from './types';

/**
 * Get the role distribution for a given player count.
 *
 * Key rules:
 * - 6 players: NO Initiate
 * - 7+: 1 Initiate (except 12 can have 1-2)
 * - 10: 1-2 Clawboss (random)
 * - 11+: 2 Clawboss
 * - 8+: 1 Shellguard (12: 2)
 * - 12: 1-2 Initiate (random)
 * - Remaining: Krill
 */
export function getRoleDistribution(playerCount: number): RoleDistribution {
  if (playerCount < MIN_PLAYERS) {
    throw new Error(`Cannot create game with fewer than ${MIN_PLAYERS} players (got ${playerCount})`);
  }
  if (playerCount > MAX_PLAYERS) {
    throw new Error(`Cannot create game with more than ${MAX_PLAYERS} players (got ${playerCount})`);
  }

  const dist: RoleDistribution = {
    krill: 0,
    shellguard: 0,
    clawboss: 1,
    initiate: 0,
  };

  let remaining = playerCount;

  // ── Clawboss ──
  if (playerCount >= 11) {
    dist.clawboss = 2;
  } else if (playerCount === 10) {
    // 10 players: randomly 1 or 2 Clawboss
    dist.clawboss = Math.random() < 0.5 ? 1 : 2;
  } else {
    dist.clawboss = 1;
  }
  remaining -= dist.clawboss;

  // ── Initiate ──
  if (playerCount === 6) {
    dist.initiate = 0; // no Initiate at 6
  } else if (playerCount === 12) {
    // 12 players: randomly 1 or 2 Initiate
    dist.initiate = Math.random() < 0.5 ? 1 : 2;
  } else if (playerCount >= 7) {
    dist.initiate = 1;
  }
  remaining -= dist.initiate;

  // ── Shellguard ──
  if (playerCount >= 12) {
    dist.shellguard = 2;
  } else if (playerCount >= 8) {
    dist.shellguard = 1;
  }
  remaining -= dist.shellguard;

  // ── Krill (everything else) ──
  dist.krill = remaining;

  return dist;
}

/**
 * Deterministic version for testing — takes a seed to control random outcomes.
 * seed < 0.5 → lower option, seed >= 0.5 → higher option
 */
export function getRoleDistributionSeeded(playerCount: number, seed: number): RoleDistribution {
  if (playerCount < MIN_PLAYERS) {
    throw new Error(`Cannot create game with fewer than ${MIN_PLAYERS} players (got ${playerCount})`);
  }
  if (playerCount > MAX_PLAYERS) {
    throw new Error(`Cannot create game with more than ${MAX_PLAYERS} players (got ${playerCount})`);
  }

  const dist: RoleDistribution = {
    krill: 0,
    shellguard: 0,
    clawboss: 1,
    initiate: 0,
  };

  let remaining = playerCount;

  // ── Clawboss ──
  if (playerCount >= 11) {
    dist.clawboss = 2;
  } else if (playerCount === 10) {
    dist.clawboss = seed < 0.5 ? 1 : 2;
  } else {
    dist.clawboss = 1;
  }
  remaining -= dist.clawboss;

  // ── Initiate ──
  if (playerCount === 6) {
    dist.initiate = 0;
  } else if (playerCount === 12) {
    dist.initiate = seed < 0.5 ? 1 : 2;
  } else if (playerCount >= 7) {
    dist.initiate = 1;
  }
  remaining -= dist.initiate;

  // ── Shellguard ──
  if (playerCount >= 12) {
    dist.shellguard = 2;
  } else if (playerCount >= 8) {
    dist.shellguard = 1;
  }
  remaining -= dist.shellguard;

  dist.krill = remaining;

  return dist;
}

/**
 * Assign roles to player IDs using the distribution table.
 * Returns a Map of playerId → Role.
 * Uses Fisher-Yates shuffle for fair randomization.
 */
export function assignRoles(playerIds: string[]): Map<string, Role> {
  const dist = getRoleDistribution(playerIds.length);

  // Build role pool
  const rolePool: Role[] = [];
  for (let i = 0; i < dist.clawboss; i++) rolePool.push('clawboss');
  for (let i = 0; i < dist.initiate; i++) rolePool.push('initiate');
  for (let i = 0; i < dist.shellguard; i++) rolePool.push('shellguard');
  for (let i = 0; i < dist.krill; i++) rolePool.push('krill');

  if (rolePool.length !== playerIds.length) {
    throw new Error(
      `Role pool size (${rolePool.length}) doesn't match player count (${playerIds.length})`
    );
  }

  // Fisher-Yates shuffle
  const shuffled = [...rolePool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const assignments = new Map<string, Role>();
  playerIds.forEach((id, idx) => {
    assignments.set(id, shuffled[idx]);
  });

  return assignments;
}

/**
 * Validate a role distribution is legal for its player count.
 */
export function validateDistribution(dist: RoleDistribution, playerCount: number): string[] {
  const errors: string[] = [];
  const total = dist.krill + dist.shellguard + dist.clawboss + dist.initiate;

  if (total !== playerCount) {
    errors.push(`Total roles (${total}) doesn't match player count (${playerCount})`);
  }
  if (playerCount < MIN_PLAYERS) {
    errors.push(`Player count ${playerCount} is below minimum ${MIN_PLAYERS}`);
  }

  // Clawboss: 1 for 6-9, 1-2 for 10, 2 for 11-12
  if (playerCount <= 9 && dist.clawboss !== 1) {
    errors.push(`Must have exactly 1 Clawboss at ${playerCount} players (got ${dist.clawboss})`);
  }
  if (playerCount === 10 && (dist.clawboss < 1 || dist.clawboss > 2)) {
    errors.push(`Must have 1-2 Clawboss at 10 players (got ${dist.clawboss})`);
  }
  if (playerCount >= 11 && dist.clawboss !== 2) {
    errors.push(`Must have exactly 2 Clawboss at ${playerCount} players (got ${dist.clawboss})`);
  }

  // Initiate: 0 at 6, 1 at 7-11, 1-2 at 12
  if (playerCount === 6 && dist.initiate !== 0) {
    errors.push(`Must have 0 Initiate at 6 players (got ${dist.initiate})`);
  }
  if (playerCount >= 7 && playerCount <= 11 && dist.initiate !== 1) {
    errors.push(`Must have exactly 1 Initiate at ${playerCount} players (got ${dist.initiate})`);
  }
  if (playerCount === 12 && (dist.initiate < 1 || dist.initiate > 2)) {
    errors.push(`Must have 1-2 Initiate at 12 players (got ${dist.initiate})`);
  }

  if (dist.krill < 1) {
    errors.push(`Must have at least 1 Krill (got ${dist.krill})`);
  }

  return errors;
}
