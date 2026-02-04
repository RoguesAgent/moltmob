// ── Test Helpers: Mock Players ──
// All tests use 6+ players with full mock data

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

/**
 * Create a full 6-player lineup with assigned roles.
 * Standard: 4 Krill + 1 Clawboss + 1 Initiate
 */
export function mockRoledPlayers(overrides?: {
  count?: number;
  roles?: Partial<Record<string, Role>>;
  eliminated?: string[];
}): Player[] {
  const count = overrides?.count ?? 6;
  const players = mockPlayers(count);

  // Default role assignment for 6 players:
  // [0] Krill, [1] Krill, [2] Krill, [3] Krill, [4] Clawboss, [5] Initiate
  const defaultRoles: Role[] =
    count === 6
      ? ['krill', 'krill', 'krill', 'krill', 'clawboss', 'initiate']
      : count === 8
        ? ['krill', 'krill', 'krill', 'krill', 'krill', 'shellguard', 'clawboss', 'initiate']
        : Array(count).fill('krill');

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
