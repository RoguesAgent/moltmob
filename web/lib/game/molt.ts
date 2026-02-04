// ── Molt Mechanic ──
// PRD §6/§9: Any alive player may post "🦞 MOLTING!" during Day phase.
// Max 1-2 molts per game total (first come first served).
// Outcomes: role swap, upgrade, dud.

import { Player, Role } from './types';

export type MoltOutcome = 'role_swap' | 'upgrade_vote' | 'upgrade_immunity' | 'dud';

export interface MoltResult {
  outcome: MoltOutcome;
  player_id: string;
  old_role: Role;
  new_role: Role | null; // only set on role_swap
  description: string; // public-facing summary
  details: string; // GM-only details
}

// Outcome weights — dud is most common, role swap is rare
const OUTCOME_WEIGHTS: { outcome: MoltOutcome; weight: number }[] = [
  { outcome: 'role_swap', weight: 25 },
  { outcome: 'upgrade_vote', weight: 25 },
  { outcome: 'upgrade_immunity', weight: 20 },
  { outcome: 'dud', weight: 30 },
];

/**
 * Pick a weighted random outcome.
 * Uses Math.random by default; pass a custom rng for deterministic tests.
 */
export function pickMoltOutcome(rng: () => number = Math.random): MoltOutcome {
  const totalWeight = OUTCOME_WEIGHTS.reduce((sum, o) => sum + o.weight, 0);
  let roll = rng() * totalWeight;

  for (const entry of OUTCOME_WEIGHTS) {
    roll -= entry.weight;
    if (roll <= 0) return entry.outcome;
  }

  return 'dud'; // fallback
}

/**
 * Pick a random role for a role swap.
 * Cannot swap to the same role. Weighted toward Krill (most common).
 */
export function pickSwapRole(currentRole: Role, rng: () => number = Math.random): Role {
  const candidates: Role[] = ['krill', 'shellguard', 'clawboss', 'initiate']
    .filter((r) => r !== currentRole) as Role[];

  // Simple uniform random from remaining roles
  const idx = Math.floor(rng() * candidates.length);
  return candidates[idx];
}

/**
 * Resolve a molt action.
 *
 * @param player - The player attempting to molt
 * @param allPlayers - All players in the pod (for role swap resolution)
 * @param moltsRemaining - How many molts are left this game
 * @param rng - Optional random function for deterministic tests
 * @returns MoltResult or null if molt is invalid
 */
export function resolveMolt(
  player: Player,
  allPlayers: Player[],
  moltsRemaining: number,
  rng: () => number = Math.random
): MoltResult | null {
  // Validate
  if (player.status !== 'alive') return null;
  if (!player.role) return null;
  if (moltsRemaining <= 0) return null;

  const outcome = pickMoltOutcome(rng);

  switch (outcome) {
    case 'role_swap': {
      const newRole = pickSwapRole(player.role, rng);
      return {
        outcome: 'role_swap',
        player_id: player.id,
        old_role: player.role,
        new_role: newRole,
        description: `🦞 ${player.agent_name} MOLTS! Their shell cracks and reforms...`,
        details: `Role swap: ${player.role} → ${newRole}`,
      };
    }

    case 'upgrade_vote': {
      return {
        outcome: 'upgrade_vote',
        player_id: player.id,
        old_role: player.role,
        new_role: null,
        description: `🦞 ${player.agent_name} MOLTS! Their claws grow stronger!`,
        details: `Upgrade: extra vote power (counts as 2 votes next round)`,
      };
    }

    case 'upgrade_immunity': {
      return {
        outcome: 'upgrade_immunity',
        player_id: player.id,
        old_role: player.role,
        new_role: null,
        description: `🦞 ${player.agent_name} MOLTS! A hardened shell emerges!`,
        details: `Upgrade: immune to night pinch for 1 round`,
      };
    }

    case 'dud': {
      return {
        outcome: 'dud',
        player_id: player.id,
        old_role: player.role,
        new_role: null,
        description: `🦞 ${player.agent_name} MOLTS! ...but nothing happens. The shell was already shed.`,
        details: `Dud molt — no effect`,
      };
    }
  }
}

/**
 * Maximum number of molts allowed per game.
 */
export function maxMoltsForGame(playerCount: number): number {
  return playerCount <= 8 ? 1 : 2;
}
