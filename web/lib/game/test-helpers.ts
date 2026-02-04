// ── Test Helpers: Mock Players ──
// All tests use 6+ players with full mock data
//
// Default role layouts per count:
//   6:  5K + 1CB (no Initiate)
//   7:  5K + 1CB + 1Init
//   8:  5K + 1SG + 1CB + 1Init
//  10:  6K + 1SG + 2CB + 1Init (uses "high" variant: 2 CB)
//  11:  7K + 1SG + 2CB + 1Init
//  12:  6K + 2SG + 2CB + 2Init (uses "high" variant: 2 Init)

import { Player, Role } from './types';

/** Mock agent names for testing — crustacean-themed */
export const MOCK_AGENTS = [
  'CrabbyPatton',
  'LobsterLord',
  'ShrimpScampi',
  'PrawnStar',
  'CrawdadKing',
  'BarnacleBot',
  'CoralCrusher',
  'TidePoolTom',
  'HermitHacker',
  'KelpKnight',
  'ReefRunner',
  'SquidSquad',
] as const;

/**
 * Create a mock player with sensible defaults.
 */
export function mockPlayer(
  index: number,
  overrides?: Partial<Player>
): Player {
  const id = overrides?.id ?? `agent_${index}`;
  const name = MOCK_AGENTS[index % MOCK_AGENTS.length];
  return {
    id,
    agent_name: overrides?.agent_name ?? name,
    wallet_pubkey: overrides?.wallet_pubkey ?? `wallet_${id}`,
    encryption_pubkey: overrides?.encryption_pubkey ?? `enc_${id}`,
    role: overrides?.role ?? null,
    status: overrides?.status ?? 'alive',
    eliminated_by: overrides?.eliminated_by ?? null,
    eliminated_round: overrides?.eliminated_round ?? null,
  };
}

/**
 * Create N mock players (default 6).
 */
export function mockPlayers(count: number = 6, overrides?: Partial<Player>[]): Player[] {
  return Array.from({ length: count }, (_, i) =>
    mockPlayer(i, overrides?.[i])
  );
}

/** Default role layouts matching the distribution table */
function getDefaultRoles(count: number): Role[] {
  switch (count) {
    case 6:
      // 5 Krill + 1 Clawboss (NO Initiate)
      return ['krill', 'krill', 'krill', 'krill', 'krill', 'clawboss'];
    case 7:
      // 5 Krill + 1 Clawboss + 1 Initiate
      return ['krill', 'krill', 'krill', 'krill', 'krill', 'clawboss', 'initiate'];
    case 8:
      // 5 Krill + 1 Shellguard + 1 Clawboss + 1 Initiate
      return ['krill', 'krill', 'krill', 'krill', 'krill', 'shellguard', 'clawboss', 'initiate'];
    case 9:
      // 6 Krill + 1 Shellguard + 1 Clawboss + 1 Initiate
      return ['krill', 'krill', 'krill', 'krill', 'krill', 'krill', 'shellguard', 'clawboss', 'initiate'];
    case 10:
      // 6 Krill + 1 Shellguard + 2 Clawboss + 1 Initiate (high variant)
      return ['krill', 'krill', 'krill', 'krill', 'krill', 'krill', 'shellguard', 'clawboss', 'clawboss', 'initiate'];
    case 11:
      // 7 Krill + 1 Shellguard + 2 Clawboss + 1 Initiate
      return ['krill', 'krill', 'krill', 'krill', 'krill', 'krill', 'krill', 'shellguard', 'clawboss', 'clawboss', 'initiate'];
    case 12:
      // 6 Krill + 2 Shellguard + 2 Clawboss + 2 Initiate (high variant)
      return ['krill', 'krill', 'krill', 'krill', 'krill', 'krill', 'shellguard', 'shellguard', 'clawboss', 'clawboss', 'initiate', 'initiate'];
    default:
      return Array(count).fill('krill');
  }
}

/**
 * Create a full lineup with assigned roles.
 *
 * Default 6-player: 5 Krill + 1 Clawboss (no Initiate at 6).
 * Clawboss is always at the end for easy reference.
 */
export function mockRoledPlayers(overrides?: {
  count?: number;
  roles?: Partial<Record<string, Role>>;
  eliminated?: string[];
}): Player[] {
  const count = overrides?.count ?? 6;
  const players = mockPlayers(count);
  const defaultRoles = getDefaultRoles(count);

  // Apply default roles
  players.forEach((p, i) => {
    p.role = defaultRoles[i] ?? 'krill';
  });

  // Apply custom role overrides
  if (overrides?.roles) {
    for (const [id, role] of Object.entries(overrides.roles)) {
      const p = players.find((pl) => pl.id === id);
      if (p && role) p.role = role;
    }
  }

  // Mark eliminated players
  if (overrides?.eliminated) {
    for (const id of overrides.eliminated) {
      const p = players.find((pl) => pl.id === id);
      if (p) {
        p.status = 'eliminated';
        p.eliminated_by = 'cooked';
        p.eliminated_round = 1;
      }
    }
  }

  return players;
}

/**
 * Get player ID by index (matches mockPlayers output).
 */
export function pid(index: number): string {
  return `agent_${index}`;
}

/**
 * Find the first player with a given role.
 */
export function findByRole(players: Player[], role: Role): Player | undefined {
  return players.find((p) => p.role === role);
}

/**
 * Find all players with a given role.
 */
export function findAllByRole(players: Player[], role: Role): Player[] {
  return players.filter((p) => p.role === role);
}
