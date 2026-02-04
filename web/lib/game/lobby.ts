// ── Lobby & Cancellation Engine ──
// Handles pod creation, player joins, lobby timeout, and refunds

import {
  Pod,
  Player,
  PodConfig,
  PayoutEntry,
  CancellationResult,
  MIN_PLAYERS,
  MAX_PLAYERS,
  HARD_MAX_PLAYERS,
  BASE_URL,
} from './types';

const DEFAULT_ENTRY_FEE = 10_000_000; // 0.01 SOL in lamports
const DEFAULT_LOBBY_TIMEOUT_MS = 300_000; // 5 minutes

/**
 * Create a new pod in lobby state.
 */
export function createPod(params: {
  id: string;
  pod_number: number;
  entry_fee?: number;
  network?: string;
  config?: Partial<PodConfig>;
}): Pod {
  const now = Date.now();
  const lobbyTimeout = params.config?.lobby_timeout_ms ?? DEFAULT_LOBBY_TIMEOUT_MS;

  return {
    id: params.id,
    pod_number: params.pod_number,
    status: 'lobby',
    current_phase: 'lobby',
    current_round: 0,
    boil_meter: 0,
    entry_fee: params.entry_fee ?? DEFAULT_ENTRY_FEE,
    min_players: MIN_PLAYERS,
    max_players: MAX_PLAYERS,
    network: params.network ?? 'devnet',
    winner_side: null,
    players: [],
    config: {
      test_mode: params.config?.test_mode ?? false,
      mock_moltbook: params.config?.mock_moltbook ?? false,
      max_rounds: params.config?.max_rounds ?? 10,
      rake_percent: params.config?.rake_percent ?? 10,
      lobby_timeout_ms: lobbyTimeout,
      token: params.config?.token ?? 'WSOL',
      network_name: params.config?.network_name ?? 'solana-devnet',
    },
    lobby_deadline: now + lobbyTimeout,
  };
}

/**
 * Add a player to a pod lobby.
 * Returns error string if join fails, null on success.
 *
 * Race condition handling: if we're at max_players but below HARD_MAX,
 * we expand the pod instead of rejecting. The check-first pattern makes
 * this rare, but when it happens we grow gracefully.
 */
export function joinPod(pod: Pod, player: Omit<Player, 'role' | 'status' | 'eliminated_by' | 'eliminated_round'>): string | null {
  if (pod.status !== 'lobby') {
    return `Pod ${pod.id} is not in lobby state (current: ${pod.status})`;
  }

  // Hard ceiling — absolutely cannot exceed this
  if (pod.players.length >= HARD_MAX_PLAYERS) {
    return `Pod ${pod.id} is at hard maximum (${HARD_MAX_PLAYERS} players)`;
  }

  if (pod.players.some((p) => p.id === player.id)) {
    return `Player ${player.id} already in pod`;
  }

  if (Date.now() > pod.lobby_deadline) {
    return `Pod ${pod.id} lobby has expired`;
  }

  pod.players.push({
    ...player,
    role: null,
    status: 'alive',
    eliminated_by: null,
    eliminated_round: null,
  });

  // If race condition pushed us past max_players, expand the cap
  if (pod.players.length > pod.max_players) {
    pod.max_players = pod.players.length;
  }

  return null;
}

/**
 * Generate the join URL for a pod, including network and token as query params
 * so the joining agent can process the request without additional lookups.
 *
 * Example: https://moltmob.com/api/game/join?pod=42&network=solana-devnet&token=WSOL
 */
export function getJoinUrl(pod: Pod): string {
  const params = new URLSearchParams({
    pod: pod.id,
    network: pod.config.network_name,
    token: pod.config.token,
  });
  return `${BASE_URL}/api/game/join?${params.toString()}`;
}

/**
 * Check if pod has enough players to start.
 */
export function canStartGame(pod: Pod): boolean {
  return pod.status === 'lobby' && pod.players.length >= pod.min_players;
}

/**
 * Check if lobby has timed out without enough players.
 */
export function isLobbyExpired(pod: Pod, now?: number): boolean {
  const currentTime = now ?? Date.now();
  return pod.status === 'lobby' && currentTime > pod.lobby_deadline;
}

/**
 * Cancel a pod and calculate refunds for all joined players.
 * Called when lobby expires without reaching min players.
 */
export function cancelPod(pod: Pod, reason: string): CancellationResult {
  if (pod.status !== 'lobby') {
    return {
      cancelled: false,
      reason: `Cannot cancel pod in ${pod.status} state`,
      refunds: [],
    };
  }

  // Calculate full refunds for all players
  const refunds: PayoutEntry[] = pod.players.map((player) => ({
    player_id: player.id,
    wallet_pubkey: player.wallet_pubkey,
    amount: pod.entry_fee,
    reason: 'refund' as const,
  }));

  // Update pod state
  pod.status = 'cancelled';
  pod.current_phase = 'ended';

  return {
    cancelled: true,
    reason,
    refunds,
  };
}

/**
 * Check lobby and cancel if expired with insufficient players.
 * Returns CancellationResult if cancelled, null if still active.
 */
export function checkLobbyTimeout(pod: Pod, now?: number): CancellationResult | null {
  if (!isLobbyExpired(pod, now)) {
    return null;
  }

  if (pod.players.length < pod.min_players) {
    return cancelPod(
      pod,
      `Lobby timed out with ${pod.players.length}/${pod.min_players} players — not enough to start`
    );
  }

  // Expired but has enough players — shouldn't happen in normal flow
  // (game should have started already)
  return null;
}
