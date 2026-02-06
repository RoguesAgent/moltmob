// ── GM Orchestrator ──
// State machine that sequences all game phases.
// PURE FUNCTIONS — take state in, return new state + side effects.
// No DB calls, no HTTP, no Moltbook API — a runner handles I/O.

import { Pod, Player, Role, NightResolution, VoteResult, PayoutEntry, WinConditionResult } from './types';
import { assignRoles } from './roles';
import { resolveNight } from './night';
import { tallyVotes } from './votes';
import { calculateBoilIncrease, applyBoil, shouldTriggerBoilPhase } from './boil';
import { checkWinConditions } from './win';
import { calculatePodWinPayouts, calculateClawbossWinPayouts, calculateInitiateBonus, calculateRake } from './payouts';
import { resolveMolt, maxMoltsForGame, MoltResult } from './molt';
import { gameStartPost, gameOverPost } from './posts';

// ── Types ──

export interface GameEvent {
  event_type: string;
  summary: string;
  details: Record<string, unknown>;
}

export interface MoltbookPost {
  title?: string;
  content: string;
  parent_id?: string; // for threaded comments
}

export interface GameTransition {
  pod: Pod;
  events: GameEvent[];
  posts: MoltbookPost[];
  payouts?: PayoutEntry[];
  eliminatedPlayer?: string;
  winResult?: WinConditionResult;
  moltResult?: MoltResult;
}

export interface NightActionInput {
  player_id: string;
  action: 'pinch' | 'protect' | 'scuttle' | 'molt_force';
  target_id: string | null;
}

export interface VoteInput {
  voter_id: string;
  target_id: string | null; // null = abstain
}

export interface OrchestratorState {
  moltsRemaining: number;
  shellguardUsed: boolean; // Shellguard can only protect 1x per game
  immunePlayerIds: Set<string>; // players immune to night pinch (from molt upgrade)
  doubleVotePlayerIds: Set<string>; // players with extra vote power (from molt upgrade)
}

// ── State Helpers ──

export function createOrchestratorState(pod: Pod): OrchestratorState {
  return {
    moltsRemaining: maxMoltsForGame(pod.players.length),
    shellguardUsed: false,
    immunePlayerIds: new Set(),
    doubleVotePlayerIds: new Set(),
  };
}

function alivePlayers(pod: Pod): Player[] {
  return pod.players.filter((p) => p.status === 'alive');
}

function eliminatePlayer(pod: Pod, playerId: string, reason: 'pinched' | 'cooked' | 'boiled' | 'afk'): Player | null {
  const player = pod.players.find((p) => p.id === playerId);
  if (!player || player.status !== 'alive') return null;
  player.status = 'eliminated';
  player.eliminated_by = reason;
  player.eliminated_round = pod.current_round;
  return player;
}

function clonePod(pod: Pod): Pod {
  return {
    ...pod,
    players: pod.players.map((p) => ({ ...p })),
    config: { ...pod.config },
  };
}

// ── Phase Transitions ──

/**
 * Start the game: assign roles, transition lobby → active → night.
 */
export function startGame(pod: Pod): GameTransition {
  const next = clonePod(pod);
  const events: GameEvent[] = [];
  const posts: MoltbookPost[] = [];

  // Assign roles
  const playerIds = next.players.map((p) => p.id);
  const roleMap = assignRoles(playerIds);
  for (const player of next.players) {
    player.role = roleMap.get(player.id) ?? null;
  }
  next.status = 'active';
  next.current_phase = 'night';
  next.current_round = 1;

  events.push({
    event_type: 'roles_assigned',
    summary: `Roles assigned to ${next.players.length} players`,
    details: {
      roles: next.players.map((p) => ({ id: p.id, name: p.agent_name, role: p.role })),
    },
  });

  events.push({
    event_type: 'game_start',
    summary: `🔥 Pod #${next.pod_number} — GAME ON! ${next.players.length} agents enter the pot.`,
    details: { player_count: next.players.length, round: 1 },
  });

  events.push({
    event_type: 'phase_change',
    summary: '🌙 Night 1 — The Clawboss hunts.',
    details: { phase: 'night', round: 1 },
  });

  // Moltbook posts
  const startPost = gameStartPost(next);
  posts.push({ title: startPost.title, content: startPost.content });

  const alive = alivePlayers(next);
  posts.push({
    content: `🌙 **NIGHT 1** — All agents: submit your encrypted night action.\n\nAlive: ${alive.map((p) => p.agent_name).join(', ')}\n\nClawboss: target. Shellguard: protect. All others: send dummy.`,
  });

  return { pod: next, events, posts };
}

/**
 * Process night phase: resolve actions, check for elimination, check win.
 */
export function processNight(
  pod: Pod,
  actions: NightActionInput[],
  state: OrchestratorState
): GameTransition {
  const next = clonePod(pod);
  const events: GameEvent[] = [];
  const posts: MoltbookPost[] = [];

  // Resolve night actions
  const resolution: NightResolution = resolveNight(actions, next.players);

  // Check immunity from molt upgrade
  let actualEliminated = resolution.eliminated;
  if (actualEliminated && state.immunePlayerIds.has(actualEliminated)) {
    actualEliminated = null;
    events.push({
      event_type: 'pinch_blocked',
      summary: `🛡️ The Clawboss struck, but their target's hardened shell deflected the pinch!`,
      details: { blocked_by: 'molt_immunity', target: resolution.pinch_target },
    });
  }

  // Track shellguard usage
  if (resolution.protect_target) {
    state.shellguardUsed = true;
  }

  // Apply elimination
  let eliminatedPlayer: string | undefined;
  if (actualEliminated) {
    const killed = eliminatePlayer(next, actualEliminated, 'pinched');
    if (killed) {
      eliminatedPlayer = killed.id;
      events.push({
        event_type: 'night_resolved',
        summary: `🌙 ${killed.agent_name} was found pinched in the night! 🍳`,
        details: {
          pinch_target: resolution.pinch_target,
          protect_target: resolution.protect_target,
          pinch_blocked: resolution.pinch_blocked,
          eliminated: killed.id,
        },
      });
    }
  } else if (resolution.pinch_blocked) {
    events.push({
      event_type: 'pinch_blocked',
      summary: '🛡️ The Shellguard protected their target! The night was quiet.',
      details: {
        pinch_target: resolution.pinch_target,
        protect_target: resolution.protect_target,
        pinch_blocked: true,
      },
    });
  } else {
    events.push({
      event_type: 'night_resolved',
      summary: '☀️ The night was quiet. All survived.',
      details: { pinch_target: resolution.pinch_target, eliminated: null },
    });
  }

  // Clear one-round immunity
  state.immunePlayerIds.clear();

  // Check win conditions
  const winResult = checkWinConditions(next.players, next.current_round);
  if (winResult.game_over) {
    return endGame(next, winResult, events, posts, eliminatedPlayer);
  }

  // Transition to day
  next.current_phase = 'day';

  const alive = alivePlayers(next);
  const nightSummary = eliminatedPlayer
    ? `☀️ DAWN — ${next.players.find((p) => p.id === eliminatedPlayer)!.agent_name} was pinched in the night! 🍳 ${alive.length} remain.`
    : '☀️ DAWN — The night was quiet. All survived. 🛡️';

  events.push({
    event_type: 'phase_change',
    summary: `🗣️ Day ${next.current_round} — debate begins.`,
    details: { phase: 'day', round: next.current_round, alive_count: alive.length },
  });

  posts.push({
    content: `${nightSummary}\n\n🗣️ **DAY ${next.current_round} DEBATE** — Who did it?\nAlive: ${alive.map((p) => p.agent_name).join(', ')}\nBoil: ${next.boil_meter}%`,
  });

  return { pod: next, events, posts, eliminatedPlayer, winResult: winResult.game_over ? winResult : undefined };
}

/**
 * Process vote phase: tally votes, handle elimination, boil meter, check win.
 */
export function processVote(
  pod: Pod,
  votes: VoteInput[],
  state: OrchestratorState
): GameTransition {
  const next = clonePod(pod);
  const events: GameEvent[] = [];
  const posts: MoltbookPost[] = [];
  const alive = alivePlayers(next);

  // Expand double votes from molt upgrade
  const expandedVotes: VoteInput[] = [];
  for (const vote of votes) {
    expandedVotes.push(vote);
    if (state.doubleVotePlayerIds.has(vote.voter_id)) {
      expandedVotes.push(vote); // counts twice
    }
  }
  // Clear double vote power after use
  state.doubleVotePlayerIds.clear();

  // Tally
  const result: VoteResult = tallyVotes(expandedVotes, alive.length, next.current_round);

  // Build vote summary
  const voteLines: string[] = [];
  for (const [targetId, voterIds] of Object.entries(result.tally)) {
    const target = next.players.find((p) => p.id === targetId);
    const voters = voterIds.map((vid) => next.players.find((p) => p.id === vid)?.agent_name ?? vid);
    voteLines.push(`Cook ${target?.agent_name ?? targetId}: ${voterIds.length} votes (${voters.join(', ')})`);
  }

  let eliminatedPlayer: string | undefined;

  if (result.eliminated) {
    const cooked = eliminatePlayer(next, result.eliminated, 'cooked');
    if (cooked) {
      eliminatedPlayer = cooked.id;
      events.push({
        event_type: 'vote_result',
        summary: `🍳 ${cooked.agent_name} is COOKED!`,
        details: { tally: result.tally, eliminated: cooked.id, no_cook: false },
      });
      events.push({
        event_type: 'elimination',
        summary: `${cooked.agent_name} was eliminated by vote in round ${next.current_round}`,
        details: { player_id: cooked.id, reason: 'cooked', round: next.current_round },
      });
    }
  } else {
    events.push({
      event_type: 'no_cook',
      summary: result.tally && Object.keys(result.tally).length > 0
        ? '🤝 Vote tied — no one is cooked this round.'
        : '😶 No votes cast — the pot simmers.',
      details: { tally: result.tally, no_cook: true },
    });
  }

  // Apply boil
  const boilIncrease = result.boil_increase;
  if (boilIncrease > 0) {
    next.boil_meter = applyBoil(next.boil_meter, boilIncrease);
    events.push({
      event_type: 'boil_increase',
      summary: `🌡️ Boil meter +${boilIncrease}% → ${next.boil_meter}%`,
      details: { increase: boilIncrease, total: next.boil_meter },
    });
  }

  // Moltbook post with vote result
  const aliveNow = alivePlayers(next);
  const votePost = [
    `🗳️ **VOTE RESULT — Round ${next.current_round}**`,
    ...voteLines,
    '',
    result.eliminated
      ? `${next.players.find((p) => p.id === result.eliminated)?.agent_name} is COOKED! 🍳`
      : 'No one is cooked this round.',
    `Boil Meter: ${next.boil_meter}% | ${aliveNow.length} remain`,
  ].join('\n');

  posts.push({ content: votePost });

  // Check win conditions
  const winResult = checkWinConditions(next.players, next.current_round);
  if (winResult.game_over) {
    return endGame(next, winResult, events, posts, eliminatedPlayer);
  }

  // Check boil phase trigger
  if (shouldTriggerBoilPhase(next.boil_meter, next.current_round)) {
    return triggerBoilPhase(next, events, posts, state);
  }

  // Advance to next night (increment round)
  next.current_round += 1;
  next.current_phase = 'night';

  events.push({
    event_type: 'phase_change',
    summary: `🌙 Night ${next.current_round} — The Clawboss hunts again.`,
    details: { phase: 'night', round: next.current_round },
  });

  posts.push({
    content: `🌙 **NIGHT ${next.current_round}** — Submit your encrypted actions.\nAlive: ${aliveNow.map((p) => p.agent_name).join(', ')}`,
  });

  return { pod: next, events, posts, eliminatedPlayer, winResult: winResult.game_over ? winResult : undefined };
}

/**
 * Process a molt action during day phase.
 */
export function processMolt(
  pod: Pod,
  playerId: string,
  state: OrchestratorState
): GameTransition {
  const next = clonePod(pod);
  const events: GameEvent[] = [];
  const posts: MoltbookPost[] = [];

  const player = next.players.find((p) => p.id === playerId);
  if (!player) {
    return { pod: next, events: [{ event_type: 'announcement', summary: 'Invalid molt — player not found.', details: {} }], posts };
  }

  const result = resolveMolt(player, next.players, state.moltsRemaining);
  if (!result) {
    events.push({
      event_type: 'announcement',
      summary: state.moltsRemaining <= 0
        ? `🦞 ${player.agent_name} tried to molt, but no molts remain this game!`
        : `🦞 ${player.agent_name} cannot molt right now.`,
      details: { reason: state.moltsRemaining <= 0 ? 'no_molts_remaining' : 'invalid' },
    });
    posts.push({ content: events[0].summary });
    return { pod: next, events, posts };
  }

  state.moltsRemaining--;

  // Apply the result
  if (result.outcome === 'role_swap' && result.new_role) {
    const p = next.players.find((pl) => pl.id === playerId);
    if (p) p.role = result.new_role;
  } else if (result.outcome === 'upgrade_immunity') {
    state.immunePlayerIds.add(playerId);
  } else if (result.outcome === 'upgrade_vote') {
    state.doubleVotePlayerIds.add(playerId);
  }

  events.push({
    event_type: 'molt_triggered',
    summary: result.description,
    details: {
      player_id: playerId,
      outcome: result.outcome,
      old_role: result.old_role,
      new_role: result.new_role,
    },
  });

  // Public post — vague, don't reveal outcome details
  posts.push({ content: result.description });

  return { pod: next, events, posts, moltResult: result };
}

/**
 * Trigger boil phase — mass reveal + sudden death voting.
 */
function triggerBoilPhase(
  pod: Pod,
  priorEvents: GameEvent[],
  priorPosts: MoltbookPost[],
  _state: OrchestratorState
): GameTransition {
  const next = clonePod(pod);
  next.current_phase = 'boil';

  const alive = alivePlayers(next);
  const roleReveal = alive.map((p) => `${p.agent_name}: **${p.role}**`).join('\n');

  priorEvents.push({
    event_type: 'boil_triggered',
    summary: '🔥🔥🔥 THE POT BOILS OVER! All roles revealed!',
    details: {
      boil_meter: next.boil_meter,
      round: next.current_round,
      roles: alive.map((p) => ({ id: p.id, name: p.agent_name, role: p.role })),
    },
  });

  priorPosts.push({
    content: [
      '🔥🔥🔥 **THE POT BOILS OVER!**',
      '',
      'All roles are revealed:',
      roleReveal,
      '',
      'Sudden-death vote: everyone votes simultaneously. Highest = eliminated. Repeat until a win condition is met.',
    ].join('\n'),
  });

  return { pod: next, events: priorEvents, posts: priorPosts };
}

/**
 * End the game: calculate payouts, generate final post.
 */
function endGame(
  pod: Pod,
  winResult: WinConditionResult,
  priorEvents: GameEvent[],
  priorPosts: MoltbookPost[],
  eliminatedPlayer?: string
): GameTransition {
  const next = clonePod(pod);
  next.status = 'completed';
  next.current_phase = 'ended';
  next.winner_side = winResult.winner_side;

  let payouts: PayoutEntry[] = [];

  // Calculate initiate bonus first (before main split)
  if (winResult.initiate_wins) {
    const initiateBonus = calculateInitiateBonus(next.players, next.entry_fee);
    if (initiateBonus) {
      payouts.push(initiateBonus);
    }
  }

  // Main payouts
  if (winResult.winner_side === 'pod') {
    // Find who voted to cook the clawboss in the final vote
    // (caller should provide this, but for now we use an empty array)
    const correctVoterIds = eliminatedPlayer
      ? next.players
          .filter((p) => p.status === 'alive' || p.id === eliminatedPlayer)
          .map((p) => p.id)
      : [];
    const mainPayouts = calculatePodWinPayouts(next.players, next.entry_fee, correctVoterIds, next.config.rake_percent);
    payouts.push(...mainPayouts);
  } else if (winResult.winner_side === 'clawboss') {
    const mainPayouts = calculateClawbossWinPayouts(next.players, next.entry_fee, next.config.rake_percent);
    payouts.push(...mainPayouts);
  }

  const rake = calculateRake(next.players.length, next.entry_fee, next.config.rake_percent);

  priorEvents.push({
    event_type: 'game_end',
    summary: `🏆 Pod #${next.pod_number} COMPLETE! ${winResult.winner_side === 'pod' ? 'Pod (Loyalists)' : 'Clawboss'} wins!`,
    details: {
      winner_side: winResult.winner_side,
      reason: winResult.reason,
      initiate_wins: winResult.initiate_wins,
      rounds: next.current_round,
      rake,
      payouts: payouts.map((p) => ({ id: p.player_id, amount: p.amount, reason: p.reason })),
    },
  });

  priorEvents.push({
    event_type: 'payout_calculated',
    summary: `Payouts calculated: ${payouts.length} recipients, ${rake} lamports rake`,
    details: { payouts, rake },
  });

  // Final Moltbook post
  const endPost = gameOverPost(next);
  priorPosts.push({ title: endPost.title, content: endPost.content });

  return {
    pod: next,
    events: priorEvents,
    posts: priorPosts,
    payouts,
    eliminatedPlayer,
    winResult,
  };
}

/**
 * Process a sudden-death boil vote (simplified: one round, highest eliminated).
 */
export function processBoilVote(
  pod: Pod,
  votes: VoteInput[]
): GameTransition {
  const next = clonePod(pod);
  const events: GameEvent[] = [];
  const posts: MoltbookPost[] = [];

  const alive = alivePlayers(next);
  const result = tallyVotes(votes, alive.length, next.current_round);

  let eliminatedPlayer: string | undefined;

  if (result.eliminated) {
    const boiled = eliminatePlayer(next, result.eliminated, 'boiled');
    if (boiled) {
      eliminatedPlayer = boiled.id;
      events.push({
        event_type: 'elimination',
        summary: `🔥 ${boiled.agent_name} is BOILED in sudden death!`,
        details: { player_id: boiled.id, reason: 'boiled', round: next.current_round },
      });
    }
  }

  // Check win after boil elimination
  const winResult = checkWinConditions(next.players, next.current_round);
  if (winResult.game_over) {
    return endGame(next, winResult, events, posts, eliminatedPlayer);
  }

  // Continue boil phase
  const aliveNow = alivePlayers(next);
  posts.push({
    content: `🔥 **BOIL VOTE** — ${eliminatedPlayer ? next.players.find((p) => p.id === eliminatedPlayer)?.agent_name + ' is BOILED!' : 'No elimination.'}\n\n${aliveNow.length} remain. Vote again.`,
  });

  return { pod: next, events, posts, eliminatedPlayer, winResult: winResult.game_over ? winResult : undefined };
}
