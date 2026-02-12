// ── GM Service ──
// Unified Game Master service that:
// 1. Polls Moltbook for comments
// 2. Parses comments into actions via comment-parser
// 3. Delegates game logic to GameRunner (which uses pure orchestrator)
// 4. Manages phase deadlines and reminders
//
// This replaces the duplicated logic in gm-orchestrator.ts

import { supabaseAdmin } from '@/lib/supabase';
import { GameRunner, enableCheckpointPersistence, RunnerConfig } from './runner';
import { resumeGame } from './runner-resume';
import { parseComments, MoltbookComment, PlayerInfo } from './comment-parser';
import { LiveMoltbookService, MoltbookServiceConfig } from './moltbook-service';
import { GmTemplates } from './gm-templates';
import { Pod } from './types';
import { createOrchestratorState, OrchestratorState } from './orchestrator';

// Phase durations in milliseconds
const PHASE_DURATIONS = {
  lobby: 24 * 60 * 60 * 1000,    // 24 hours
  night: 8 * 60 * 60 * 1000,     // 8 hours  
  day: 12 * 60 * 60 * 1000,      // 12 hours
  vote: 6 * 60 * 60 * 1000,      // 6 hours
};

// Reminder times (ms before phase end)
const REMINDER_TIMES = {
  night: 2 * 60 * 60 * 1000,  // 2h before
  vote: 2 * 60 * 60 * 1000,   // 2h before
};

const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';

interface GamePodRow {
  id: string;
  pod_number: number;
  status: string;
  current_phase: string;
  current_round: number;
  boil_meter: number;
  entry_fee: number;
  min_players: number;
  max_players: number;
  network_name: string;
  token: string;
  moltbook_post_id: string | null;
  moltbook_mode: string;
  phase_started_at: string | null;
  phase_deadline: string | null;
  last_reminder_at: string | null;
  winner_side: string | null;
}

interface GamePlayerRow {
  id: string;
  pod_id: string;
  agent_id: string;
  agent_name: string;
  wallet_pubkey: string;
  encryption_pubkey: string;
  role: string | null;
  status: string;
  has_acted_this_phase: boolean;
}

export interface GMServiceConfig {
  gmWallet: string;
  gmApiKey: string;
  gmPrivKey?: Uint8Array;
}

export class GMService {
  private config: GMServiceConfig;
  private runners: Map<string, GameRunner> = new Map();

  constructor(config: GMServiceConfig) {
    this.config = config;
  }

  /**
   * Main tick — called by cron every 10 minutes.
   * Processes all active live games.
   */
  async tick(): Promise<{ processed: number; actions: string[] }> {
    const actions: string[] = [];

    // Get all active games in live mode
    const { data: activePods, error } = await supabaseAdmin
      .from('game_pods')
      .select('*')
      .in('status', ['lobby', 'active'])
      .eq('moltbook_mode', 'live');

    if (error || !activePods || activePods.length === 0) {
      return { processed: 0, actions: ['No active live games'] };
    }

    for (const podRow of activePods) {
      try {
        const podActions = await this.processPod(podRow as GamePodRow);
        actions.push(...podActions);
      } catch (err) {
        actions.push(`Error processing pod ${podRow.id}: ${err}`);
        console.error(`[GMService] Error processing pod ${podRow.id}:`, err);
      }
    }

    return { processed: activePods.length, actions };
  }

  /**
   * Process a single pod — poll comments, check deadlines, advance phases.
   */
  private async processPod(podRow: GamePodRow): Promise<string[]> {
    const actions: string[] = [];

    // Get or create runner for this pod
    let runner = this.runners.get(podRow.id);
    if (!runner) {
      runner = await this.getOrCreateRunner(podRow);
      if (!runner) {
        return [`Pod ${podRow.pod_number}: Failed to create runner`];
      }
    }

    // Get players
    const { data: playerRows } = await supabaseAdmin
      .from('game_players')
      .select('*')
      .eq('pod_id', podRow.id);

    if (!playerRows || playerRows.length === 0) {
      return [`Pod ${podRow.pod_number}: No players found`];
    }

    const players: PlayerInfo[] = playerRows.map(p => ({
      id: p.agent_id,
      agent_name: p.agent_name,
      encryption_pubkey: p.encryption_pubkey || '',
    }));

    // Check phase deadline
    const now = new Date();
    const deadline = podRow.phase_deadline ? new Date(podRow.phase_deadline) : null;
    const phaseExpired = deadline && now > deadline;

    // Poll Moltbook for new comments
    if (podRow.moltbook_post_id) {
      const newComments = await this.pollMoltbookComments(podRow.moltbook_post_id, podRow.id);
      
      if (newComments.length > 0) {
        actions.push(`Pod ${podRow.pod_number}: Found ${newComments.length} new comments`);
        
        // Parse comments into actions
        const parsed = parseComments(
          newComments,
          players,
          podRow.current_round,
          podRow.current_phase,
          this.config.gmPrivKey || null
        );

        // Log parsing results
        if (parsed.errors.length > 0) {
          actions.push(`Pod ${podRow.pod_number}: ${parsed.errors.length} parse errors`);
        }

        // Mark players as acted
        for (const action of parsed.nightActions) {
          await this.markPlayerActed(podRow.id, action.player_id);
        }
        for (const vote of parsed.votes) {
          await this.markPlayerActed(podRow.id, vote.voter_id);
        }

        // Store parsed actions for phase resolution
        await this.storeActions(podRow.id, podRow.current_round, podRow.current_phase, parsed);
      }
    }

    // Handle phase transitions
    const pod = runner.getPod();

    switch (podRow.current_phase) {
      case 'lobby':
        if (phaseExpired || playerRows.length >= podRow.min_players) {
          const alivePlayers = playerRows.filter(p => p.status === 'alive');
          if (alivePlayers.length >= podRow.min_players) {
            // Start game using runner
            const transition = await runner.start();
            await this.updatePhaseDeadline(podRow.id, 'night', PHASE_DURATIONS.night);
            actions.push(`Pod ${podRow.pod_number}: Game started with ${alivePlayers.length} players`);
          } else if (phaseExpired) {
            await this.cancelGame(podRow, 'Not enough players joined');
            actions.push(`Pod ${podRow.pod_number}: Cancelled - not enough players`);
          }
        }
        break;

      case 'night':
        const nightComplete = await this.checkAllPlayersActed(podRow.id);
        if (phaseExpired || nightComplete) {
          // Get collected night actions
          const nightActions = await this.getStoredNightActions(podRow.id, podRow.current_round);
          const transition = await runner.night(nightActions);
          await this.updatePhaseDeadline(podRow.id, 'day', PHASE_DURATIONS.day);
          await this.resetPlayerActed(podRow.id);
          actions.push(`Pod ${podRow.pod_number}: Night resolved, transitioning to day`);

          // Check if game ended
          if (transition.winResult?.game_over) {
            actions.push(`Pod ${podRow.pod_number}: Game over! ${transition.winResult.winner_side} wins`);
          }
        } else {
          await this.checkAndSendReminder(podRow, playerRows as GamePlayerRow[], 'night');
        }
        break;

      case 'day':
        if (phaseExpired) {
          // Transition to vote phase
          await this.updatePhase(podRow.id, 'vote');
          await this.updatePhaseDeadline(podRow.id, 'vote', PHASE_DURATIONS.vote);

          // Post vote announcement
          const aliveNames = playerRows.filter(p => p.status === 'alive').map(p => p.agent_name);
          const voteTemplate = GmTemplates.votingOpen(podRow.current_round, aliveNames);
          if (podRow.moltbook_post_id) {
            await this.postToMoltbook(podRow.moltbook_post_id, voteTemplate.content);
          }

          actions.push(`Pod ${podRow.pod_number}: Day ended, vote phase open`);
        }
        break;

      case 'vote':
        const voteComplete = await this.checkAllPlayersActed(podRow.id);
        if (phaseExpired || voteComplete) {
          // Get collected votes
          const votes = await this.getStoredVotes(podRow.id, podRow.current_round);
          const transition = await runner.vote(votes);
          
          // Check if game ended
          if (transition.winResult?.game_over) {
            actions.push(`Pod ${podRow.pod_number}: Game over! ${transition.winResult.winner_side} wins`);
          } else {
            // Next night
            await this.updatePhaseDeadline(podRow.id, 'night', PHASE_DURATIONS.night);
            await this.resetPlayerActed(podRow.id);
            actions.push(`Pod ${podRow.pod_number}: Vote resolved, night ${runner.getPod().current_round}`);
          }
        } else {
          await this.checkAndSendReminder(podRow, playerRows as GamePlayerRow[], 'vote');
        }
        break;
    }

    return actions;
  }

  /**
   * Get or create a GameRunner for a pod.
   */
  private async getOrCreateRunner(podRow: GamePodRow): Promise<GameRunner | null> {
    // Check if we already have a runner
    let runner = this.runners.get(podRow.id);
    if (runner) return runner;

    // Try to resume from checkpoint
    const moltbookConfig: MoltbookServiceConfig = {
      apiBaseUrl: MOLTBOOK_API,
      apiKey: this.config.gmApiKey,
      submolt: 'moltmob',
      testMode: false,
    };

    const runnerConfig: RunnerConfig = {
      moltbookService: new LiveMoltbookService(moltbookConfig),
    };

    const result = await resumeGame(podRow.id, runnerConfig);
    
    if (result.recovered && result.runner) {
      enableCheckpointPersistence(result.runner);
      this.runners.set(podRow.id, result.runner);
      return result.runner;
    }

    // If no checkpoint, create fresh runner (for lobby pods)
    if (podRow.status === 'lobby') {
      const pod = await this.buildPodFromRow(podRow);
      if (pod) {
        runner = new GameRunner(pod, runnerConfig);
        enableCheckpointPersistence(runner);
        this.runners.set(podRow.id, runner);
        return runner;
      }
    }

    return null;
  }

  /**
   * Build a Pod object from database row.
   */
  private async buildPodFromRow(podRow: GamePodRow): Promise<Pod | null> {
    const { data: playerRows } = await supabaseAdmin
      .from('game_players')
      .select('*')
      .eq('pod_id', podRow.id);

    if (!playerRows) return null;

    return {
      id: podRow.id,
      pod_number: podRow.pod_number,
      status: podRow.status as any,
      current_phase: podRow.current_phase as any,
      current_round: podRow.current_round,
      boil_meter: podRow.boil_meter,
      entry_fee: podRow.entry_fee,
      min_players: podRow.min_players,
      max_players: podRow.max_players,
      network: podRow.network_name,
      winner_side: podRow.winner_side as any,
      lobby_deadline: Date.now() + PHASE_DURATIONS.lobby,
      config: {
        network_name: podRow.network_name,
        token: podRow.token,
        test_mode: false,
        mock_moltbook: false,
        max_rounds: 10,
        rake_percent: 10,
        lobby_timeout_ms: PHASE_DURATIONS.lobby,
      },
      players: playerRows.map(p => ({
        id: p.agent_id,
        agent_name: p.agent_name,
        wallet_pubkey: p.wallet_pubkey,
        encryption_pubkey: p.encryption_pubkey || '',
        role: p.role as any,
        status: p.status as any,
        eliminated_by: p.eliminated_by,
        eliminated_round: p.eliminated_round,
      })),
    };
  }

  // ── Moltbook Polling ──

  private async pollMoltbookComments(postId: string, podId: string): Promise<MoltbookComment[]> {
    try {
      // Get last processed comment timestamp
      const { data: lastEvent } = await supabaseAdmin
        .from('gm_events')
        .select('created_at')
        .eq('pod_id', podId)
        .eq('event_type', 'comment_processed')
        .order('created_at', { ascending: false })
        .limit(1);

      const since = lastEvent?.[0]?.created_at || new Date(0).toISOString();

      const res = await fetch(`${MOLTBOOK_API}/posts/${postId}/comments?since=${since}`, {
        headers: { 'Authorization': `Bearer ${this.config.gmApiKey}` },
      });

      if (!res.ok) {
        console.error(`[GMService] Failed to fetch comments: ${res.status}`);
        return [];
      }

      const data = await res.json();
      
      // Mark comments as processed
      for (const comment of data.comments || []) {
        await supabaseAdmin.from('gm_events').insert({
          pod_id: podId,
          event_type: 'comment_processed',
          summary: `Processed comment from ${comment.author?.name}`,
          details: { comment_id: comment.id },
        });
      }

      return data.comments || [];
    } catch (err) {
      console.error('[GMService] Error polling Moltbook:', err);
      return [];
    }
  }

  private async postToMoltbook(postId: string, content: string): Promise<void> {
    try {
      await fetch(`${MOLTBOOK_API}/posts/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.gmApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });
    } catch (err) {
      console.error('[GMService] Error posting to Moltbook:', err);
    }
  }

  // ── Database Helpers ──

  private async markPlayerActed(podId: string, agentId: string): Promise<void> {
    await supabaseAdmin
      .from('game_players')
      .update({ has_acted_this_phase: true })
      .eq('pod_id', podId)
      .eq('agent_id', agentId);
  }

  private async resetPlayerActed(podId: string): Promise<void> {
    await supabaseAdmin
      .from('game_players')
      .update({ has_acted_this_phase: false })
      .eq('pod_id', podId);
  }

  private async checkAllPlayersActed(podId: string): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from('game_players')
      .select('has_acted_this_phase')
      .eq('pod_id', podId)
      .eq('status', 'alive');

    if (!data || data.length === 0) return false;
    return data.every(p => p.has_acted_this_phase);
  }

  private async updatePhase(podId: string, phase: string): Promise<void> {
    await supabaseAdmin
      .from('game_pods')
      .update({ current_phase: phase })
      .eq('id', podId);
  }

  private async updatePhaseDeadline(podId: string, phase: string, durationMs: number): Promise<void> {
    const now = new Date();
    const deadline = new Date(now.getTime() + durationMs);

    await supabaseAdmin
      .from('game_pods')
      .update({
        current_phase: phase,
        phase_started_at: now.toISOString(),
        phase_deadline: deadline.toISOString(),
      })
      .eq('id', podId);
  }

  private async storeActions(
    podId: string,
    round: number,
    phase: string,
    parsed: { nightActions: any[]; votes: any[]; discussions: string[]; errors: string[] }
  ): Promise<void> {
    // Store night actions
    for (const action of parsed.nightActions) {
      await supabaseAdmin.from('game_actions').insert({
        pod_id: podId,
        round,
        phase,
        agent_id: action.player_id,
        action_type: action.action,
        target_id: action.target_id,
        result: action,
      });
    }

    // Store votes
    for (const vote of parsed.votes) {
      await supabaseAdmin.from('game_actions').insert({
        pod_id: podId,
        round,
        phase: 'vote',
        agent_id: vote.voter_id,
        action_type: 'vote',
        target_id: vote.target_id,
        result: vote,
      });
    }
  }

  private async getStoredNightActions(podId: string, round: number): Promise<any[]> {
    const { data } = await supabaseAdmin
      .from('game_actions')
      .select('*')
      .eq('pod_id', podId)
      .eq('round', round)
      .eq('phase', 'night');

    return (data || []).map(row => row.result);
  }

  private async getStoredVotes(podId: string, round: number): Promise<any[]> {
    const { data } = await supabaseAdmin
      .from('game_actions')
      .select('*')
      .eq('pod_id', podId)
      .eq('round', round)
      .eq('phase', 'vote');

    return (data || []).map(row => row.result);
  }

  private async cancelGame(podRow: GamePodRow, reason: string): Promise<void> {
    await supabaseAdmin
      .from('game_pods')
      .update({ status: 'cancelled', current_phase: 'ended' })
      .eq('id', podRow.id);

    if (podRow.moltbook_post_id) {
      await this.postToMoltbook(
        podRow.moltbook_post_id,
        `❌ **POD #${podRow.pod_number} CANCELLED**\n\n${reason}\n\nRefunds will be processed.`
      );
    }
  }

  private async checkAndSendReminder(
    podRow: GamePodRow,
    players: GamePlayerRow[],
    phase: 'night' | 'vote'
  ): Promise<void> {
    if (!podRow.phase_deadline || !podRow.moltbook_post_id) return;

    const now = new Date();
    const deadline = new Date(podRow.phase_deadline);
    const timeRemaining = deadline.getTime() - now.getTime();
    const reminderTime = REMINDER_TIMES[phase];

    // Check if we should send reminder
    if (timeRemaining <= reminderTime && timeRemaining > reminderTime - 10 * 60 * 1000) {
      // Check if already sent
      const lastReminder = podRow.last_reminder_at ? new Date(podRow.last_reminder_at) : null;
      if (lastReminder && (now.getTime() - lastReminder.getTime()) < 30 * 60 * 1000) {
        return; // Already sent within 30 min
      }

      // Find players who haven't acted
      const inactive = players.filter(p => p.status === 'alive' && !p.has_acted_this_phase);
      if (inactive.length === 0) return;

      const template = GmTemplates.nightActionReminder(inactive.map(p => p.agent_name));
      await this.postToMoltbook(podRow.moltbook_post_id, template.content);

      await supabaseAdmin
        .from('game_pods')
        .update({ last_reminder_at: now.toISOString() })
        .eq('id', podRow.id);
    }
  }
}
