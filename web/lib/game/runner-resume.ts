// ── Game Runner Recovery ──
// Handles crash recovery for GM agent
// Loads game state from DB and reconstructs GameRunner

import { supabaseAdmin } from '@/lib/supabase';
import { GameRunner, RunnerConfig } from './runner';
import { OrchestratorState } from './orchestrator';
import { Pod } from './types';
import { GmTemplates } from './gm-templates';

export interface RecoveryResult {
  runner: GameRunner | null;
  state: OrchestratorState | null;
  gamePostId: string | null;
  recovered: boolean;
  error?: string;
}

/**
 * Resume a game from DB after GM crash/restart
 * Call this on GM boot for any 'active' or 'paused' pods
 */
export async function resumeGame(
  podId: string,
  config: RunnerConfig
): Promise<RecoveryResult> {
  try {
    // 1. Load pod from DB
    const { data: podData, error: podError } = await supabaseAdmin
      .from('game_pods')
      .select('*')
      .eq('id', podId)
      .single();

    if (podError || !podData) {
      return { runner: null, state: null, gamePostId: null, recovered: false, error: 'Pod not found' };
    }

    // 2. Load players
    const { data: playersData, error: playersError } = await supabaseAdmin
      .from('game_players')
      .select('*')
      .eq('pod_id', podId);

    if (playersError) {
      return { runner: null, state: null, gamePostId: null, recovered: false, error: 'Failed to load players' };
    }

    // 3. Load orchestrator state from gm_events (last checkpoint)
    const { data: events, error: eventsError } = await supabaseAdmin
      .from('gm_events')
      .select('details')
      .eq('pod_id', podId)
      .eq('event_type', 'orchestrator_checkpoint')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // 4. Load gamePostId from gm_events
    const { data: gameStartEvent } = await supabaseAdmin
      .from('gm_events')
      .select('details')
      .eq('pod_id', podId)
      .eq('event_type', 'game_start')
      .single();

    const gamePostId = gameStartEvent?.details?.game_post_id || null;

    // 5. Reconstruct Pod object
    const pod: Pod = {
      id: podData.id,
      pod_number: podData.pod_number,
      status: podData.status,
      current_phase: podData.current_phase,
      current_round: podData.current_round,
      boil_meter: podData.boil_meter,
      entry_fee: podData.entry_fee,
      config: {
        network_name: podData.network_name,
        token: podData.token,
        min_players: podData.min_players || 6,
        max_players: podData.max_players || 12,
      },
      players: (playersData || []).map(p => ({
        id: p.agent_id,
        agent_name: p.agent_name,
        wallet_pubkey: p.wallet_pubkey,
        role: p.role,
        status: p.status,
        eliminated_by: p.eliminated_by,
        eliminated_round: p.eliminated_round,
      })),
      winner_side: podData.winner_side,
    };

    // 6. Reconstruct state
    const state: OrchestratorState = events?.details?.orchestrator_state || {
      moltsRemaining: Math.max(0, 12 - pod.players.length),
      shellguardUsed: false,
      immunePlayerIds: new Set(),
      doubleVotePlayerIds: new Set(),
    };

    // Ensure Sets are proper Set objects
    if (state.immunePlayerIds && !(state.immunePlayerIds instanceof Set)) {
      state.immunePlayerIds = new Set(state.immunePlayerIds);
    }
    if (state.doubleVotePlayerIds && !(state.doubleVotePlayerIds instanceof Set)) {
      state.doubleVotePlayerIds = new Set(state.doubleVotePlayerIds);
    }

    // 7. Create GameRunner with reconstructed state
    const runner = new GameRunner(pod, config);
    
    // Restore state using public setters
    runner.setState(state);
    runner.setGamePostId(gamePostId);

    // 8. Post recovery message using template
    if (gamePostId) {
      const recoveryMsg = GmTemplates.gmRecovery(
        pod.pod_number,
        pod.current_round,
        pod.current_phase,
        new Date().toISOString()
      );
      await config.moltbookService.createComment(gamePostId, recoveryMsg.content);
    }

    return {
      runner,
      state,
      gamePostId,
      recovered: true,
    };

  } catch (error) {
    return {
      runner: null,
      state: null,
      gamePostId: null,
      recovered: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get all active/paused pods that need recovery
 */
export async function getActivePods(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('game_pods')
    .select('id')
    .in('status', ['active', 'paused', 'bidding']);

  if (error || !data) return [];
  return data.map(p => p.id);
}

/**
 * GM Boot Recovery - call this when GM agent starts
 */
export async function recoverAllActivePods(config: RunnerConfig): Promise<RecoveryResult[]> {
  const podIds = await getActivePods();
  const results: RecoveryResult[] = [];

  for (const podId of podIds) {
    const result = await resumeGame(podId, config);
    results.push(result);
    
    if (result.recovered) {
      console.log(`[Recovery] Resumed pod ${podId} at round ${result.runner?.getPod().current_round}`);
    } else {
      console.error(`[Recovery] Failed to resume pod ${podId}: ${result.error}`);
    }
  }

  return results;
}

/**
 * Enhanced GameRunner with auto-save checkpoints
 * Use this instead of base GameRunner for production
 */
export async function createResilientRunner(
  pod: Pod,
  config: RunnerConfig
): Promise<GameRunner> {
  const { enableCheckpointPersistence } = await import('./runner');
  const runner = new GameRunner(pod, config);
  enableCheckpointPersistence(runner);
  return runner;
}
