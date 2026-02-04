// ── Payout Calculation Engine ──
// PRD §10: Prize Distribution

import { Player, PayoutEntry, ROLE_ALIGNMENT } from './types';

/**
 * Calculate payouts when Pod (town) wins.
 *
 * PRD §10.1:
 * - 60% of pool → correct voters (voted to cook Clawboss)
 * - 30% of pool → alive town-aligned agents
 * - 10% rake
 *
 * @param correctVoterIds - players who voted to eliminate the Clawboss
 */
export function calculatePodWinPayouts(
  players: Player[],
  entryFee: number,
  correctVoterIds: string[],
  rakePercent: number = 10
): PayoutEntry[] {
  const totalPool = entryFee * players.length;
  const rake = Math.floor((totalPool * rakePercent) / 100);
  const distributable = totalPool - rake;

  const bountyPool = Math.floor(distributable * 0.6); // 60% to correct voters
  const survivalPool = distributable - bountyPool; // 30% effectively (remaining after bounty)

  const payouts: PayoutEntry[] = [];

  // Bounty: correct voters
  const validVoters = correctVoterIds.filter((id) => {
    const p = players.find((pl) => pl.id === id);
    return p && ROLE_ALIGNMENT[p.role!] !== 'killer'; // Clawboss can't claim bounty
  });

  if (validVoters.length > 0) {
    const bountyPerVoter = Math.floor(bountyPool / validVoters.length);
    for (const voterId of validVoters) {
      const player = players.find((p) => p.id === voterId)!;
      payouts.push({
        player_id: voterId,
        wallet_pubkey: player.wallet_pubkey,
        amount: bountyPerVoter,
        reason: 'bounty',
      });
    }
  }

  // Survival: alive town-aligned agents
  const aliveTown = players.filter(
    (p) => p.status === 'alive' && ROLE_ALIGNMENT[p.role!] === 'pod'
  );
  if (aliveTown.length > 0) {
    const survivalPerPlayer = Math.floor(survivalPool / aliveTown.length);
    for (const player of aliveTown) {
      // Check if already has bounty payout — add survival on top
      const existing = payouts.find((p) => p.player_id === player.id);
      if (existing) {
        existing.amount += survivalPerPlayer;
      } else {
        payouts.push({
          player_id: player.id,
          wallet_pubkey: player.wallet_pubkey,
          amount: survivalPerPlayer,
          reason: 'survival',
        });
      }
    }
  }

  return payouts;
}

/**
 * Calculate payouts when Clawboss wins.
 *
 * PRD §10.2:
 * - 90% of pool → Clawboss
 * - 10% rake
 */
export function calculateClawbossWinPayouts(
  players: Player[],
  entryFee: number,
  rakePercent: number = 10
): PayoutEntry[] {
  const totalPool = entryFee * players.length;
  const rake = Math.floor((totalPool * rakePercent) / 100);
  const clawbossPayout = totalPool - rake;

  const clawboss = players.find((p) => p.role === 'clawboss');
  if (!clawboss) throw new Error('No Clawboss found');

  return [
    {
      player_id: clawboss.id,
      wallet_pubkey: clawboss.wallet_pubkey,
      amount: clawbossPayout,
      reason: 'clawboss_win',
    },
  ];
}

/**
 * Calculate Initiate payout (when Initiate survives to win condition).
 *
 * PRD §10.3:
 * - Entry refund + bonus from pool
 * - Calculated BEFORE main winner split
 */
export function calculateInitiateBonus(
  players: Player[],
  entryFee: number,
  bonusPercent: number = 5 // 5% of pool as bonus
): PayoutEntry | null {
  const initiate = players.find(
    (p) => p.role === 'initiate' && p.status === 'alive'
  );
  if (!initiate) return null;

  const totalPool = entryFee * players.length;
  const bonus = Math.floor((totalPool * bonusPercent) / 100);

  return {
    player_id: initiate.id,
    wallet_pubkey: initiate.wallet_pubkey,
    amount: entryFee + bonus, // refund + bonus
    reason: 'initiate_win',
  };
}

/**
 * Calculate the rake amount.
 */
export function calculateRake(
  playerCount: number,
  entryFee: number,
  rakePercent: number = 10
): number {
  return Math.floor((playerCount * entryFee * rakePercent) / 100);
}
