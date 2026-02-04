// ── Game Runner ──
// Connects the pure orchestrator to real I/O:
// - Reads/writes game state to Supabase
// - Publishes posts to Moltbook (via MoltbookService)
// - Logs events to gm_events table
// - Records transactions

import { supabaseAdmin } from '@/lib/supabase';
import {
  startGame,
  processNight,
  processVote,
  processMolt,
  processBoilVote,
  createOrchestratorState,
  GameTransition,
  NightActionInput,
  VoteInput,
} from './orchestrator';
import { createPod, canStartGame } from './lobby';
import { MoltbookService, MockMoltbookService } from './moltbook-service';
import { Pod, PodConfig } from './types';
import type { OrchestratorState } from './orchestrator';

export interface RunnerConfig {
  moltbookService: MoltbookService;
}

/**
 * Persist a game transition to the database.
 * Writes pod state, events, and transactions.
 */
async function persistTransition(transition: GameTransition, gamePostId?: string) {
  const { pod, events, payouts } = transition;

  // Update pod state
  await supabaseAdmin
    .from('game_pods')
    .upsert({
      id: pod.id,
      pod_number: pod.pod_number,
      status: pod.status,
      current_phase: pod.current_phase,
      current_round: pod.current_round,
      boil_meter: pod.boil_meter,
      entry_fee: pod.entry_fee,
      network_name: pod.config.network_name,
      token: pod.config.token,
      winner_side: pod.winner_side,
    }, { onConflict: 'id' });

  // Update player states
  for (const player of pod.players) {
    await supabaseAdmin
      .from('game_players')
      .upsert({
        pod_id: pod.id,
        agent_id: player.id,
        role: player.role,
        status: player.status,
        eliminated_by: player.eliminated_by,
        eliminated_round: player.eliminated_round,
      }, { onConflict: 'pod_id,agent_id' });
  }

  // Log events
  for (const event of events) {
    await supabaseAdmin
      .from('gm_events')
      .insert({
        pod_id: pod.id,
        round: pod.current_round,
        phase: pod.current_phase,
        event_type: event.event_type,
        summary: event.summary,
        details: event.details,
      });
  }

  // Record payout transactions
  if (payouts) {
    for (const payout of payouts) {
      await supabaseAdmin
        .from('game_transactions')
        .insert({
          pod_id: pod.id,
          agent_id: payout.player_id,
          tx_type: `payout_${payout.reason}`,
          amount: payout.amount,
          wallet_to: payout.wallet_pubkey,
          tx_status: 'pending',
          reason: payout.reason,
          round: pod.current_round,
        });
    }
  }
}

/**
 * The Game Runner — manages a single pod's lifecycle.
 */
export class GameRunner {
  private pod: Pod;
  private state: OrchestratorState | null = null;
  private moltbook: MoltbookService;
  private gamePostId: string | null = null; // Moltbook thread ID

  constructor(pod: Pod, config: RunnerConfig) {
    this.pod = pod;
    this.moltbook = config.moltbookService;
  }

  /** Get current pod state */
  getPod(): Pod {
    return this.pod;
  }

  /** Get orchestrator state */
  getState(): OrchestratorState | null {
    return this.state;
  }

  /**
   * Start the game — assign roles, create Moltbook thread, transition to night.
   */
  async start(): Promise<GameTransition> {
    if (!canStartGame(this.pod)) {
      throw new Error(`Cannot start game: need ${this.pod.min_players} players, have ${this.pod.players.length}`);
    }

    const transition = startGame(this.pod);
    this.pod = transition.pod;
    this.state = createOrchestratorState(this.pod);

    // Publish to Moltbook
    if (transition.posts.length > 0) {
      const firstPost = transition.posts[0];
      if (firstPost.title) {
        const posted = await this.moltbook.createPost(firstPost.title, firstPost.content);
        this.gamePostId = posted.id;
        await this.moltbook.pinPost(posted.id);
      }

      // Remaining posts as comments on the thread
      if (this.gamePostId && transition.posts.length > 1) {
        await this.moltbook.publishToThread(this.gamePostId, transition.posts.slice(1));
      }
    }

    // Persist to DB
    await persistTransition(transition, this.gamePostId || undefined);

    return transition;
  }

  /**
   * Process a night phase with collected actions.
   */
  async night(actions: NightActionInput[]): Promise<GameTransition> {
    if (!this.state) throw new Error('Game not started');
    if (this.pod.current_phase !== 'night') throw new Error(`Not in night phase (current: ${this.pod.current_phase})`);

    const transition = processNight(this.pod, actions, this.state);
    this.pod = transition.pod;

    if (this.gamePostId) {
      await this.moltbook.publishToThread(this.gamePostId, transition.posts);
    }
    await persistTransition(transition);

    return transition;
  }

  /**
   * Process a vote phase with collected votes.
   */
  async vote(votes: VoteInput[]): Promise<GameTransition> {
    if (!this.state) throw new Error('Game not started');
    if (this.pod.current_phase !== 'vote' && this.pod.current_phase !== 'day') {
      throw new Error(`Not in vote phase (current: ${this.pod.current_phase})`);
    }
    // Allow voting from day phase (transition day → vote is implicit)
    this.pod.current_phase = 'vote';

    const transition = processVote(this.pod, votes, this.state);
    this.pod = transition.pod;

    if (this.gamePostId) {
      await this.moltbook.publishToThread(this.gamePostId, transition.posts);
    }
    await persistTransition(transition);

    return transition;
  }

  /**
   * Process a molt action from a player.
   */
  async molt(playerId: string): Promise<GameTransition> {
    if (!this.state) throw new Error('Game not started');
    if (this.pod.current_phase !== 'day') throw new Error(`Molt only allowed during day phase (current: ${this.pod.current_phase})`);

    const transition = processMolt(this.pod, playerId, this.state);
    this.pod = transition.pod;

    if (this.gamePostId) {
      await this.moltbook.publishToThread(this.gamePostId, transition.posts);
    }
    await persistTransition(transition);

    return transition;
  }

  /**
   * Process a boil phase vote (sudden death).
   */
  async boilVote(votes: VoteInput[]): Promise<GameTransition> {
    if (!this.state) throw new Error('Game not started');
    if (this.pod.current_phase !== 'boil') throw new Error(`Not in boil phase (current: ${this.pod.current_phase})`);

    const transition = processBoilVote(this.pod, votes);
    this.pod = transition.pod;

    if (this.gamePostId) {
      await this.moltbook.publishToThread(this.gamePostId, transition.posts);
    }
    await persistTransition(transition);

    return transition;
  }
}

// Re-export OrchestratorState type for external use
export type { OrchestratorState } from './orchestrator';
