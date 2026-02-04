// ── Boil Meter Engine ──
// PRD §8: Boil Meter

/**
 * Calculate boil meter increase based on vote outcome.
 *
 * Rules:
 * - Normal elimination: +0%
 * - No-lynch (tie or majority abstain):
 *   - Rounds 1-2: +15% (per Game Design review recommendation)
 *   - Rounds 3-5: +25%
 *   - Rounds 6+: +40%
 * - 0 votes cast: +50%
 * - <50% participation (but >0 votes): +10%
 */
export function calculateBoilIncrease(params: {
  round: number;
  totalAlive: number;
  totalVotes: number; // total votes cast (including no_lynch)
  eliminated: boolean; // whether someone was eliminated
}): number {
  const { round, totalAlive, totalVotes, eliminated } = params;

  // 0 votes cast — worst case
  if (totalVotes === 0) {
    return 50;
  }

  // Normal elimination — no boil increase
  if (eliminated) {
    return 0;
  }

  // No-lynch occurred (votes were cast but no elimination)
  // Check participation first
  const participation = totalVotes / totalAlive;

  // Low participation penalty (stacks with no-lynch)
  let increase = 0;

  if (participation < 0.5) {
    increase += 10;
  }

  // No-lynch scaling by round
  if (round <= 2) {
    increase += 15;
  } else if (round <= 5) {
    increase += 25;
  } else {
    increase += 40;
  }

  return increase;
}

/**
 * Apply boil increase to current meter, capping at 100.
 */
export function applyBoil(currentBoil: number, increase: number): number {
  return Math.min(100, currentBoil + increase);
}

/**
 * Check if boil phase should trigger.
 * Triggers at 100% boil OR round 10 (hard cap).
 */
export function shouldTriggerBoilPhase(boilMeter: number, round: number): boolean {
  return boilMeter >= 100 || round >= 10;
}
