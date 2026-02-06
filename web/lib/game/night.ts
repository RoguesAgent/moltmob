// ── Night Phase Resolution ──
// PRD §5 Phase 3: Night

import { Player, NightResolution, NightAction } from './types';

interface NightActionInput {
  player_id: string;
  action: NightAction;
  target_id: string | null;
}

/**
 * Resolve a night phase.
 *
 * Rules:
 * - Clawboss submits 'pinch' with target
 * - Shellguard submits 'protect' with target (if unused; 1x per game)
 * - Krill/Initiate submit 'scuttle'
 * - If pinch target === protect target → protection succeeds
 * - Otherwise → target eliminated
 * - Shellguard cannot self-protect
 */
export function resolveNight(
  actions: NightActionInput[],
  players: Player[]
): NightResolution {
  let pinchTarget: string | null = null;
  let protectTarget: string | null = null;

  for (const action of actions) {
    if (action.action === 'pinch' && action.target_id) {
      pinchTarget = action.target_id;
    }
    if (action.action === 'protect' && action.target_id) {
      // Validate: Shellguard cannot self-protect
      if (action.target_id !== action.player_id) {
        protectTarget = action.target_id;
      }
      // If self-protect attempted, silently ignore (treat as dummy)
    }
  }

  // Clawboss must always have a target
  if (!pinchTarget) {
    return {
      pinch_target: null,
      protect_target: protectTarget,
      pinch_blocked: false,
      eliminated: null,
    };
  }

  // Validate target is alive
  const targetPlayer = players.find((p) => p.id === pinchTarget);
  if (!targetPlayer || targetPlayer.status !== 'alive') {
    return {
      pinch_target: pinchTarget,
      protect_target: protectTarget,
      pinch_blocked: false,
      eliminated: null,
    };
  }

  // Resolution
  const pinchBlocked = pinchTarget === protectTarget;
  const eliminated = pinchBlocked ? null : pinchTarget;

  return {
    pinch_target: pinchTarget,
    protect_target: protectTarget,
    pinch_blocked: pinchBlocked,
    eliminated,
  };
}

/**
 * Validate night actions from all players.
 * Returns errors if any player's action is invalid.
 */
export function validateNightActions(
  actions: NightActionInput[],
  players: Player[]
): string[] {
  const errors: string[] = [];
  const alivePlayers = players.filter((p) => p.status === 'alive');
  const aliveIds = new Set(alivePlayers.map((p) => p.id));
  const submittedIds = new Set(actions.map((a) => a.player_id));

  // Check all alive players submitted
  for (const player of alivePlayers) {
    if (!submittedIds.has(player.id)) {
      errors.push(`Player ${player.agent_name} (${player.id}) did not submit a night action`);
    }
  }

  // Check no dead players submitted
  for (const action of actions) {
    if (!aliveIds.has(action.player_id)) {
      errors.push(`Dead/disconnected player ${action.player_id} cannot submit night actions`);
    }
  }

  // Validate Clawboss targets alive player
  for (const action of actions) {
    if (action.action === 'pinch' && action.target_id) {
      if (!aliveIds.has(action.target_id)) {
        errors.push(`Clawboss cannot target dead player ${action.target_id}`);
      }
      // Clawboss cannot self-target
      if (action.target_id === action.player_id) {
        errors.push('Clawboss cannot target themselves');
      }
    }
  }

  return errors;
}
