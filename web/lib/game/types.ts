// ── Core Game Types ──

export type Role = 'krill' | 'shellguard' | 'clawboss' | 'initiate';
export type Alignment = 'pod' | 'killer' | 'neutral';
export type PodStatus = 'lobby' | 'bidding' | 'active' | 'completed' | 'cancelled';
export type GamePhase = 'lobby' | 'bidding' | 'night' | 'day' | 'vote' | 'molt' | 'boil' | 'ended';
export type NightAction = 'pinch' | 'protect' | 'dummy' | 'molt_force';
export type VoteAction = 'cook' | 'no_lynch' | 'abstain';
export type EliminationReason = 'pinched' | 'cooked' | 'boiled' | 'afk' | 'disconnected';

export const ROLE_ALIGNMENT: Record<Role, Alignment> = {
  krill: 'pod',
  shellguard: 'pod',
  clawboss: 'killer',
  initiate: 'neutral',
};

export interface RoleDistribution {
  krill: number;
  shellguard: number;
  clawboss: number;
  initiate: number;
}

export interface Player {
  id: string;
  agent_name: string;
  wallet_pubkey: string;
  encryption_pubkey: string;
  role: Role | null;
  status: 'alive' | 'eliminated' | 'disconnected';
  eliminated_by: EliminationReason | null;
  eliminated_round: number | null;
}

export const MIN_PLAYERS = 6;
export const MAX_PLAYERS = 12; // soft cap — race conditions can push above this
export const HARD_MAX_PLAYERS = 16; // absolute ceiling if race condition expands

export interface Pod {
  id: string;
  pod_number: number;
  status: PodStatus;
  current_phase: GamePhase;
  current_round: number;
  boil_meter: number;
  entry_fee: number; // lamports
  min_players: number;
  max_players: number;
  network: string;
  winner_side: 'pod' | 'clawboss' | null;
  players: Player[];
  config: PodConfig;
  lobby_deadline: number; // unix ms — lobby closes at this time
}

export type TokenSymbol = 'WSOL';
export type NetworkName = 'solana-devnet' | 'solana-mainnet';

export const BASE_URL = 'https://moltmob.com';

export interface PodConfig {
  test_mode: boolean;
  mock_moltbook: boolean;
  max_rounds: number; // default 10
  rake_percent: number; // default 10
  lobby_timeout_ms: number; // default 300_000 (5 min)
  token: TokenSymbol; // default 'WSOL'
  network_name: NetworkName; // default 'solana-devnet'
}

export interface CancellationResult {
  cancelled: boolean;
  reason: string;
  refunds: PayoutEntry[];
}

export interface NightResolution {
  pinch_target: string | null; // player id
  protect_target: string | null; // player id
  pinch_blocked: boolean;
  eliminated: string | null; // player id
}

export interface VoteResult {
  tally: Record<string, string[]>; // target_id → voter_ids
  eliminated: string | null;
  no_lynch: boolean;
  boil_increase: number;
}

export interface PayoutEntry {
  player_id: string;
  wallet_pubkey: string;
  amount: number; // lamports
  reason: 'bounty' | 'survival' | 'clawboss_win' | 'initiate_win' | 'refund';
}

export interface WinConditionResult {
  game_over: boolean;
  winner_side: 'pod' | 'clawboss' | null;
  initiate_wins: boolean;
  reason: string;
}
