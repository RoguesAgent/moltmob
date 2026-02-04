// ── Role Assignment Engine ──
// PRD §3.2: Distribution Table
// Updated: Initiate only exists at 6+ players

import { Role, RoleDistribution, MIN_PLAYERS, MAX_PLAYERS } from './types';

/**
 * Get the role distribution for a given player count.
 * Always exactly 1 Clawboss, 1 Initiate (min 6 players guarantees this).
 * Shellguard at 8+ players (1-2 depending on count).
 * Remaining slots filled with Krill.
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
    clawboss: 1, // always exactly 1
    initiate: 0,
  };

  let remaining = playerCount - 1; // minus clawboss

  // Initiate only at 6+ players
  if (playerCount >= 6) {
    dist.initiate = 1;
    remaining -= 1;
  }

  // Shellguard distribution
  if (playerCount >= 8) {
    dist.shellguard = 1;
    remaining -= 1;
  }
  if (playerCount >= 12) {
    dist.shellguard = 2;
    remaining -= 1; // already subtracted 1 above, so subtract 1 more
  }

  // All remaining are Krill
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
 * Validate a role distribution is legal.
 */
export function validateDistribution(dist: RoleDistribution, playerCount: number): string[] {
  const errors: string[] = [];
  const total = dist.krill + dist.shellguard + dist.clawboss + dist.initiate;

  if (total !== playerCount) {
    errors.push(`Total roles (${total}) doesn't match player count (${playerCount})`);
  }
  if (dist.clawboss !== 1) {
    errors.push(`Must have exactly 1 Clawboss (got ${dist.clawboss})`);
  }
  if (playerCount < MIN_PLAYERS) {
    errors.push(`Player count ${playerCount} is below minimum ${MIN_PLAYERS}`);
  }
  if (dist.initiate !== 1) {
    errors.push(`Must have exactly 1 Initiate (got ${dist.initiate})`);
  }
  if (dist.krill < 1) {
    errors.push(`Must have at least 1 Krill (got ${dist.krill})`);
  }

  return errors;
}
