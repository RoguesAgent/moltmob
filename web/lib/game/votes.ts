// ── Vote Tallying Engine ──
// PRD §5 Phase 5: Vote

import { VoteResult } from './types';

interface VoteInput {
  voter_id: string;
  target_id: string | null; // null = release (no-cook)
}

/**
 * Tally votes and determine elimination outcome.
 *
 * Rules:
 * - Majority vote eliminates target
 * - Tie = no-cook
 * - Minimum 2 votes on a target to eliminate (per Game Design review)
 * - 0 votes = no-cook + severe boil penalty
 * - Eliminated players' votes are ignored (caller should filter)
 */
export function tallyVotes(
  votes: VoteInput[],
  totalAlive: number,
  round: number
): VoteResult {
  const tally: Record<string, string[]> = {};
  let totalCast = 0;

  for (const vote of votes) {
    if (vote.target_id === null) continue; // release (no-cook)
    totalCast++;
    if (!tally[vote.target_id]) {
      tally[vote.target_id] = [];
    }
    tally[vote.target_id].push(vote.voter_id);
  }

  // Find the target with the most votes
  let maxVotes = 0;
  let maxTarget: string | null = null;
  let isTied = false;

  for (const [target, voters] of Object.entries(tally)) {
    if (voters.length > maxVotes) {
      maxVotes = voters.length;
      maxTarget = target;
      isTied = false;
    } else if (voters.length === maxVotes) {
      isTied = true;
    }
  }

  // Determine outcome
  const noCook = totalCast === 0 || // nobody voted
                 isTied ||           // tie
                 maxVotes < 2;       // below minimum threshold

  const eliminated = noCook ? null : maxTarget;

  // Calculate boil increase
  let boilIncrease = 0;
  if (totalCast === 0) {
    boilIncrease = 50;
  } else if (noCook) {
    // No-cook scaling by round
    if (round <= 2) boilIncrease = 15;
    else if (round <= 5) boilIncrease = 25;
    else boilIncrease = 40;

    // Low participation bonus penalty
    if (totalCast / totalAlive < 0.5) {
      boilIncrease += 10;
    }
  }
  // Normal elimination: boilIncrease stays 0

  return {
    tally,
    eliminated,
    no_cook: noCook,
    boil_increase: boilIncrease,
  };
}
