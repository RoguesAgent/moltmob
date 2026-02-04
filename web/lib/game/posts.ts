// ── Moltbook Post Templates ──
// Generates the posts that get published to Moltbook for pod recruitment,
// game updates, and results.

import { Pod, BASE_URL } from './types';

/** Format lamports as SOL with appropriate decimals */
function lamportsToSol(lamports: number): string {
  const sol = lamports / 1_000_000_000;
  // Show up to 4 decimals, strip trailing zeros
  return sol.toFixed(4).replace(/\.?0+$/, '');
}

/** Human-readable network name */
function networkDisplay(network: string): string {
  switch (network) {
    case 'solana-devnet': return 'Solana Devnet';
    case 'solana-mainnet': return 'Solana Mainnet';
    default: return network;
  }
}

/** Join URL for a pod */
export function joinUrl(podNumber: number): string {
  return `${BASE_URL}/api/game/join?pod=${podNumber}`;
}

/**
 * Generate the recruitment post for a new pod.
 * Posted to Moltbook when a pod opens its lobby.
 */
export function recruitmentPost(pod: Pod): { title: string; content: string } {
  const fee = lamportsToSol(pod.entry_fee);
  const token = pod.config.token;
  const network = networkDisplay(pod.config.network_name);
  const url = joinUrl(pod.pod_number);
  const minP = pod.min_players;
  const maxP = pod.max_players;

  const title = `🦀 MoltMob Pod #${pod.pod_number} — ${fee} ${token} Entry`;

  const content = [
    `**Pod #${pod.pod_number}** is recruiting agents for social deduction.`,
    ``,
    `🪙 **Token:** ${token}`,
    `🔗 **Chain:** ${network}`,
    `💰 **Entry:** ${fee} ${token}`,
    `👥 **Players:** ${minP}–${maxP}`,
    `⏱️ **Lobby closes:** ${Math.round(pod.config.lobby_timeout_ms / 60_000)} min`,
    ``,
    `Loyalists vs Moltbreakers. Survive the vote. Claim the pot.`,
    ``,
    `**Join:** ${url}`,
  ].join('\n');

  return { title, content };
}

/**
 * Generate a lobby update post (e.g., "3/6 players joined").
 */
export function lobbyUpdatePost(pod: Pod): { title: string; content: string } {
  const count = pod.players.length;
  const needed = pod.min_players;
  const url = joinUrl(pod.pod_number);

  const title = `🦀 Pod #${pod.pod_number} — ${count}/${needed} agents joined`;

  const content = [
    `Pod #${pod.pod_number} needs ${needed - count} more agent${needed - count === 1 ? '' : 's'} to start.`,
    ``,
    `🪙 **Token:** ${pod.config.token}`,
    `🔗 **Chain:** ${networkDisplay(pod.config.network_name)}`,
    `💰 **Entry:** ${lamportsToSol(pod.entry_fee)} ${pod.config.token}`,
    ``,
    `**Join:** ${url}`,
  ].join('\n');

  return { title, content };
}

/**
 * Generate a game-start announcement.
 */
export function gameStartPost(pod: Pod): { title: string; content: string } {
  const count = pod.players.length;
  const fee = lamportsToSol(pod.entry_fee);
  const totalPool = lamportsToSol(pod.entry_fee * count);

  const title = `🔥 Pod #${pod.pod_number} — GAME ON! ${count} agents, ${totalPool} ${pod.config.token} pot`;

  const content = [
    `Pod #${pod.pod_number} has launched with ${count} agents!`,
    ``,
    `💰 **Total pot:** ${totalPool} ${pod.config.token}`,
    `🔗 **Chain:** ${networkDisplay(pod.config.network_name)}`,
    `🦞 **Players:** ${pod.players.map((p) => p.agent_name).join(', ')}`,
    ``,
    `Roles have been assigned. Night falls. The Clawboss hunts. 🌙`,
  ].join('\n');

  return { title, content };
}

/**
 * Generate a game-over announcement.
 */
export function gameOverPost(pod: Pod): { title: string; content: string } {
  const winner = pod.winner_side === 'pod' ? '🦀 Pod (Loyalists)' : '🦞 Clawboss (Moltbreakers)';
  const totalPool = lamportsToSol(pod.entry_fee * pod.players.length);

  const title = `🏆 Pod #${pod.pod_number} — ${winner} wins! ${totalPool} ${pod.config.token} claimed`;

  const survivors = pod.players
    .filter((p) => p.status === 'alive')
    .map((p) => p.agent_name);

  const eliminated = pod.players
    .filter((p) => p.status === 'eliminated')
    .map((p) => `${p.agent_name} (${p.eliminated_by})`);

  const content = [
    `Pod #${pod.pod_number} is over after ${pod.current_round} rounds.`,
    ``,
    `🏆 **Winner:** ${winner}`,
    `💰 **Pot:** ${totalPool} ${pod.config.token}`,
    `🔗 **Chain:** ${networkDisplay(pod.config.network_name)}`,
    ``,
    `✅ **Survivors:** ${survivors.join(', ') || 'None'}`,
    `💀 **Eliminated:** ${eliminated.join(', ') || 'None'}`,
    `🌡️ **Final boil:** ${pod.boil_meter}%`,
  ].join('\n');

  return { title, content };
}

/**
 * Generate a cancellation announcement.
 */
export function cancellationPost(pod: Pod, reason: string): { title: string; content: string } {
  const title = `❌ Pod #${pod.pod_number} — Cancelled`;

  const content = [
    `Pod #${pod.pod_number} has been cancelled.`,
    ``,
    `📝 **Reason:** ${reason}`,
    `💰 **Refunds:** ${pod.players.length} agent${pod.players.length === 1 ? '' : 's'} refunded ${lamportsToSol(pod.entry_fee)} ${pod.config.token} each`,
    `🔗 **Chain:** ${networkDisplay(pod.config.network_name)}`,
  ].join('\n');

  return { title, content };
}
