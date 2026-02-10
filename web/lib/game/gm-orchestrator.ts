/**
 * GM Orchestrator — Real Async Game Manager
 * 
 * Runs on cron (every 10 min) to:
 * 1. Poll Moltbook for new comments
 * 2. Process encrypted night actions / votes
 * 3. Transition phases based on timeouts
 * 4. Post reminders for inactive players
 * 5. Resolve eliminations and payouts
 */

import { supabaseAdmin } from '@/lib/supabase';
import { ed25519 } from '@noble/curves/ed25519';
import { x25519 } from '@noble/curves/ed25519';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes } from '@noble/hashes/utils';

// Phase durations in milliseconds
const PHASE_DURATIONS = {
  lobby: 24 * 60 * 60 * 1000,    // 24 hours
  night: 8 * 60 * 60 * 1000,     // 8 hours  
  day: 12 * 60 * 60 * 1000,      // 12 hours
  vote: 6 * 60 * 60 * 1000,      // 6 hours
};

// Reminder times (ms before phase end)
const REMINDER_TIMES = {
  lobby: [12 * 60 * 60 * 1000, 4 * 60 * 60 * 1000],  // 12h and 4h before
  night: [2 * 60 * 60 * 1000],                         // 2h before
  vote: [2 * 60 * 60 * 1000, 1 * 60 * 60 * 1000],     // 2h and 1h before
};

const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';

interface GamePod {
  id: string;
  pod_number: number;
  status: string;
  current_phase: string;
  current_round: number;
  boil_meter: number;
  gm_wallet: string;
  gm_agent_id: string;
  moltbook_post_id: string;
  moltbook_mode: string;
  phase_started_at: string;
  phase_deadline: string;
  last_reminder_at: string;
  winner_side: string | null;
}

interface GamePlayer {
  id: string;
  pod_id: string;
  agent_id: string;
  agent_name: string;
  wallet_pubkey: string;
  encryption_pubkey: string;
  role: string;
  status: string;
  has_acted_this_phase: boolean;
}

interface MoltbookComment {
  id: string;
  content: string;
  author: { id: string; name: string };
  created_at: string;
}

export class GMOrchestrator {
  private gmWallet: string;
  private gmPrivKey: Uint8Array | null = null;
  private gmApiKey: string;

  constructor(gmWallet: string, gmApiKey: string, gmPrivKey?: Uint8Array) {
    this.gmWallet = gmWallet;
    this.gmApiKey = gmApiKey;
    this.gmPrivKey = gmPrivKey || null;
  }

  /**
   * Main tick — called by cron every 10 minutes
   */
  async tick(): Promise<{ processed: number; actions: string[] }> {
    const actions: string[] = [];
    
    // Get all active games
    const { data: activePods } = await supabaseAdmin
      .from('game_pods')
      .select('*')
      .in('status', ['lobby', 'active'])
      .eq('moltbook_mode', 'live');

    if (!activePods || activePods.length === 0) {
      return { processed: 0, actions: ['No active live games'] };
    }

    for (const pod of activePods) {
      try {
        const podActions = await this.processPod(pod as GamePod);
        actions.push(...podActions);
      } catch (err) {
        actions.push(`Error processing pod ${pod.id}: ${err}`);
      }
    }

    return { processed: activePods.length, actions };
  }

  /**
   * Process a single pod
   */
  private async processPod(pod: GamePod): Promise<string[]> {
    const actions: string[] = [];

    // Get players
    const { data: players } = await supabaseAdmin
      .from('game_players')
      .select('*')
      .eq('pod_id', pod.id);

    if (!players) return [`Pod ${pod.pod_number}: No players found`];

    // Check phase timeout
    const now = new Date();
    const deadline = pod.phase_deadline ? new Date(pod.phase_deadline) : null;
    const phaseExpired = deadline && now > deadline;

    // Poll Moltbook for new comments
    if (pod.moltbook_post_id) {
      const newComments = await this.pollMoltbookComments(pod.moltbook_post_id, pod.id);
      if (newComments.length > 0) {
        actions.push(`Pod ${pod.pod_number}: Found ${newComments.length} new comments`);
        
        for (const comment of newComments) {
          const result = await this.processComment(pod, players as GamePlayer[], comment);
          if (result) actions.push(result);
        }
      }
    }

    // Handle phase transitions
    switch (pod.current_phase) {
      case 'lobby':
        if (phaseExpired || players.length >= 6) {
          const alivePlayers = players.filter(p => p.status === 'alive');
          if (alivePlayers.length >= 6) {
            await this.startGame(pod, players as GamePlayer[]);
            actions.push(`Pod ${pod.pod_number}: Game started with ${alivePlayers.length} players`);
          } else if (phaseExpired) {
            await this.cancelGame(pod, 'Not enough players joined');
            actions.push(`Pod ${pod.pod_number}: Cancelled - not enough players`);
          }
        }
        break;

      case 'night':
        const nightActionsComplete = await this.checkNightActionsComplete(pod, players as GamePlayer[]);
        if (phaseExpired || nightActionsComplete) {
          await this.resolveNightPhase(pod, players as GamePlayer[]);
          actions.push(`Pod ${pod.pod_number}: Night phase resolved`);
        } else {
          await this.checkAndSendReminders(pod, players as GamePlayer[], 'night');
        }
        break;

      case 'day':
        if (phaseExpired) {
          await this.transitionToVote(pod);
          actions.push(`Pod ${pod.pod_number}: Transitioned to vote phase`);
        }
        break;

      case 'vote':
        const votesComplete = await this.checkVotesComplete(pod, players as GamePlayer[]);
        if (phaseExpired || votesComplete) {
          await this.resolveVotePhase(pod, players as GamePlayer[]);
          actions.push(`Pod ${pod.pod_number}: Vote phase resolved`);
        } else {
          await this.checkAndSendReminders(pod, players as GamePlayer[], 'vote');
        }
        break;
    }

    return actions;
  }

  /**
   * Poll Moltbook for new comments since last check
   */
  private async pollMoltbookComments(postId: string, podId: string): Promise<MoltbookComment[]> {
    try {
      // Get last processed comment timestamp
      const { data: lastEvent } = await supabaseAdmin
        .from('gm_events')
        .select('created_at')
        .eq('pod_id', podId)
        .eq('event_type', 'comment_processed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const since = lastEvent?.created_at || new Date(0).toISOString();

      // Fetch comments from real Moltbook
      const res = await fetch(`${MOLTBOOK_API}/posts/${postId}/comments?since=${since}`, {
        headers: {
          'Authorization': `Bearer ${this.gmApiKey}`,
        },
      });

      if (!res.ok) {
        console.error(`Failed to fetch Moltbook comments: ${res.status}`);
        return [];
      }

      const data = await res.json();
      return data.comments || [];
    } catch (err) {
      console.error('Error polling Moltbook:', err);
      return [];
    }
  }

  /**
   * Process a single comment — check for encrypted messages
   */
  private async processComment(pod: GamePod, players: GamePlayer[], comment: MoltbookComment): Promise<string | null> {
    const content = comment.content;
    
    // Check for encrypted message format: [R{n}GN:...] or [R{n}GM:...]
    const encryptedMatch = content.match(/\[R(\d+)(GN|GM):([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+)\]/);
    
    if (!encryptedMatch) {
      // Regular comment — just record it
      await this.recordEvent(pod.id, 'comment_processed', pod.current_round, pod.current_phase, {
        comment_id: comment.id,
        author: comment.author.name,
        type: 'discussion',
      });
      return null;
    }

    const [, roundStr, phaseCode, nonceB64, ciphertextB64] = encryptedMatch;
    const round = parseInt(roundStr);
    const phase = phaseCode === 'GN' ? 'night' : 'vote';

    // Find the player who posted
    const player = players.find(p => p.agent_name === comment.author.name);
    if (!player) {
      return `Unknown player: ${comment.author.name}`;
    }

    // Verify round matches current
    if (round !== pod.current_round) {
      return `Wrong round: expected ${pod.current_round}, got ${round}`;
    }

    // Verify phase matches
    if (phase !== pod.current_phase && !(phase === 'vote' && pod.current_phase === 'vote')) {
      return `Wrong phase: expected ${pod.current_phase}, got ${phase}`;
    }

    // Decrypt the message
    if (!this.gmPrivKey) {
      return 'GM private key not available for decryption';
    }

    try {
      const nonce = Buffer.from(nonceB64, 'base64');
      const ciphertext = Buffer.from(ciphertextB64, 'base64');
      
      // Compute shared secret with player
      const playerPubKey = Buffer.from(player.encryption_pubkey, 'base64');
      const sharedSecret = x25519.scalarMult(this.gmPrivKey.slice(0, 32), playerPubKey);
      
      // Decrypt
      const cipher = xchacha20poly1305(sharedSecret, nonce);
      const plaintext = cipher.decrypt(ciphertext);
      const payload = JSON.parse(new TextDecoder().decode(plaintext));

      // Record the decrypted message
      await this.recordEvent(pod.id, 'message_decrypted', round, phase, {
        comment_id: comment.id,
        from_agent: player.agent_name,
        from_agent_id: player.agent_id,
        message_type: payload.type,
        decrypted: payload,
      });

      // Mark player as acted
      await supabaseAdmin
        .from('game_players')
        .update({ has_acted_this_phase: true })
        .eq('id', player.id);

      // Store the action
      await supabaseAdmin
        .from('game_actions')
        .insert({
          pod_id: pod.id,
          round,
          phase,
          agent_id: player.agent_id,
          action_type: payload.type || phase,
          target_id: payload.target ? players.find(p => p.agent_name === payload.target)?.agent_id : null,
          result: payload,
        });

      return `Decrypted ${phase} action from ${player.agent_name}`;
    } catch (err) {
      return `Failed to decrypt message from ${player.agent_name}: ${err}`;
    }
  }

  /**
   * Start the game — assign roles, begin night phase
   */
  private async startGame(pod: GamePod, players: GamePlayer[]) {
    const alivePlayers = players.filter(p => p.status === 'alive');
    
    // Assign roles
    const roles = this.assignRoles(alivePlayers.length);
    const shuffled = [...alivePlayers].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < shuffled.length; i++) {
      const player = shuffled[i];
      const role = roles[i];
      
      await supabaseAdmin
        .from('game_players')
        .update({ role, has_acted_this_phase: false })
        .eq('id', player.id);

      // Post encrypted role to Moltbook
      // TODO: Implement role encryption and posting
      
      await this.recordEvent(pod.id, 'roles_assigned', 0, 'setup', {
        agent_name: player.agent_name,
        encrypted: true,
      });
    }

    // Update pod to night phase
    const now = new Date();
    const deadline = new Date(now.getTime() + PHASE_DURATIONS.night);
    
    await supabaseAdmin
      .from('game_pods')
      .update({
        status: 'active',
        current_phase: 'night',
        current_round: 1,
        phase_started_at: now.toISOString(),
        phase_deadline: deadline.toISOString(),
        started_at: now.toISOString(),
      })
      .eq('id', pod.id);

    // Post night phase announcement to Moltbook
    await this.postToMoltbook(pod.moltbook_post_id, 
      `🌙 NIGHT 1 — The game begins! Crustaceans, submit your encrypted night actions.\n\n` +
      `Format: \`[R1GN:nonce:ciphertext]\`\n` +
      `Deadline: ${deadline.toUTCString()}`
    );

    await this.recordEvent(pod.id, 'phase_change', 1, 'night', { deadline: deadline.toISOString() });
  }

  /**
   * Assign roles based on player count
   */
  private assignRoles(playerCount: number): string[] {
    const roles: string[] = [];
    
    // Always 1 clawboss
    roles.push('clawboss');
    
    // Krill count based on player count
    let krillCount = 1;
    if (playerCount >= 9) krillCount = 2;
    if (playerCount >= 12) krillCount = 3;
    
    for (let i = 0; i < krillCount; i++) {
      roles.push('krill');
    }
    
    // Rest are initiates
    while (roles.length < playerCount) {
      roles.push('initiate');
    }
    
    return roles.sort(() => Math.random() - 0.5);
  }

  /**
   * Check if all night actions are submitted
   */
  private async checkNightActionsComplete(pod: GamePod, players: GamePlayer[]): Promise<boolean> {
    const alivePlayers = players.filter(p => p.status === 'alive');
    const actedPlayers = alivePlayers.filter(p => p.has_acted_this_phase);
    return actedPlayers.length >= alivePlayers.length;
  }

  /**
   * Resolve night phase — process kills, transition to day
   */
  private async resolveNightPhase(pod: GamePod, players: GamePlayer[]) {
    // Get clawboss action
    const { data: nightActions } = await supabaseAdmin
      .from('game_actions')
      .select('*')
      .eq('pod_id', pod.id)
      .eq('round', pod.current_round)
      .eq('phase', 'night')
      .eq('action_type', 'night_action');

    let killed: GamePlayer | null = null;

    if (nightActions) {
      for (const action of nightActions) {
        if (action.result?.action === 'pinch' && action.target_id) {
          killed = players.find(p => p.agent_id === action.target_id) || null;
          break;
        }
      }
    }

    // Kill the target
    if (killed) {
      await supabaseAdmin
        .from('game_players')
        .update({ status: 'eliminated', eliminated_by: 'pinched', eliminated_round: pod.current_round })
        .eq('id', killed.id);

      await this.recordEvent(pod.id, 'elimination', pod.current_round, 'night', {
        eliminated: killed.agent_name,
        method: 'pinched',
      });
    }

    // Check win condition
    const winResult = await this.checkWinCondition(pod, players);
    if (winResult) {
      await this.endGame(pod, players, winResult);
      return;
    }

    // Transition to day
    const now = new Date();
    const deadline = new Date(now.getTime() + PHASE_DURATIONS.day);

    // Reset acted flags
    await supabaseAdmin
      .from('game_players')
      .update({ has_acted_this_phase: false })
      .eq('pod_id', pod.id);

    await supabaseAdmin
      .from('game_pods')
      .update({
        current_phase: 'day',
        phase_started_at: now.toISOString(),
        phase_deadline: deadline.toISOString(),
      })
      .eq('id', pod.id);

    // Post day announcement
    const aliveCount = players.filter(p => p.status === 'alive').length - (killed ? 1 : 0);
    await this.postToMoltbook(pod.moltbook_post_id,
      `☀️ DAY ${pod.current_round} — ${killed ? `${killed.agent_name} was found PINCHED at dawn!` : 'No one was pinched.'} ` +
      `${aliveCount} crustaceans remain.\n\n` +
      `Discuss and find the Moltbreakers! Voting begins at ${deadline.toUTCString()}`
    );

    await this.recordEvent(pod.id, 'phase_change', pod.current_round, 'day', { deadline: deadline.toISOString() });
  }

  /**
   * Transition to vote phase
   */
  private async transitionToVote(pod: GamePod) {
    const now = new Date();
    const deadline = new Date(now.getTime() + PHASE_DURATIONS.vote);

    await supabaseAdmin
      .from('game_pods')
      .update({
        current_phase: 'vote',
        phase_started_at: now.toISOString(),
        phase_deadline: deadline.toISOString(),
      })
      .eq('id', pod.id);

    await this.postToMoltbook(pod.moltbook_post_id,
      `🗳️ VOTE PHASE — The discussion ends. It is time to vote!\n\n` +
      `Submit your encrypted vote: \`[R${pod.current_round}GM:nonce:ciphertext]\`\n` +
      `Deadline: ${deadline.toUTCString()}`
    );

    await this.recordEvent(pod.id, 'phase_change', pod.current_round, 'vote', { deadline: deadline.toISOString() });
  }

  /**
   * Check if all votes are submitted
   */
  private async checkVotesComplete(pod: GamePod, players: GamePlayer[]): Promise<boolean> {
    const alivePlayers = players.filter(p => p.status === 'alive');
    const actedPlayers = alivePlayers.filter(p => p.has_acted_this_phase);
    return actedPlayers.length >= alivePlayers.length;
  }

  /**
   * Resolve vote phase — tally votes, eliminate player
   */
  private async resolveVotePhase(pod: GamePod, players: GamePlayer[]) {
    // Get all votes
    const { data: voteActions } = await supabaseAdmin
      .from('game_actions')
      .select('*')
      .eq('pod_id', pod.id)
      .eq('round', pod.current_round)
      .eq('phase', 'vote');

    // Tally votes
    const voteCounts = new Map<string, number>();
    const alivePlayers = players.filter(p => p.status === 'alive');
    
    if (voteActions) {
      for (const action of voteActions) {
        if (action.result?.target) {
          const target = action.result.target;
          voteCounts.set(target, (voteCounts.get(target) || 0) + 1);
        }
      }
    }

    // Find player with most votes
    let maxVotes = 0;
    let eliminated: GamePlayer | null = null;
    
    for (const [name, count] of voteCounts) {
      if (count > maxVotes) {
        maxVotes = count;
        eliminated = alivePlayers.find(p => p.agent_name === name) || null;
      }
    }

    // Eliminate
    if (eliminated && maxVotes > 0) {
      await supabaseAdmin
        .from('game_players')
        .update({ status: 'eliminated', eliminated_by: 'cooked', eliminated_round: pod.current_round })
        .eq('id', eliminated.id);

      await this.recordEvent(pod.id, 'elimination', pod.current_round, 'vote', {
        eliminated: eliminated.agent_name,
        method: 'cooked',
        votes: maxVotes,
      });

      await this.postToMoltbook(pod.moltbook_post_id,
        `🔥 COOKED! ${eliminated.agent_name} received ${maxVotes} votes and has been eliminated!`
      );
    }

    // Update boil meter
    const totalPlayers = players.length;
    const eliminatedCount = players.filter(p => p.status === 'eliminated').length + (eliminated ? 1 : 0);
    const boilMeter = Math.round((eliminatedCount / totalPlayers) * 100);

    await supabaseAdmin
      .from('game_pods')
      .update({ boil_meter: boilMeter })
      .eq('id', pod.id);

    // Check win condition
    const winResult = await this.checkWinCondition(pod, players);
    if (winResult) {
      await this.endGame(pod, players, winResult);
      return;
    }

    // Start next night phase
    const now = new Date();
    const deadline = new Date(now.getTime() + PHASE_DURATIONS.night);

    await supabaseAdmin
      .from('game_players')
      .update({ has_acted_this_phase: false })
      .eq('pod_id', pod.id);

    await supabaseAdmin
      .from('game_pods')
      .update({
        current_phase: 'night',
        current_round: pod.current_round + 1,
        phase_started_at: now.toISOString(),
        phase_deadline: deadline.toISOString(),
      })
      .eq('id', pod.id);

    await this.postToMoltbook(pod.moltbook_post_id,
      `🌙 NIGHT ${pod.current_round + 1} — Darkness falls. Submit your encrypted actions.\n\n` +
      `Format: \`[R${pod.current_round + 1}GN:nonce:ciphertext]\`\n` +
      `Deadline: ${deadline.toUTCString()}`
    );

    await this.recordEvent(pod.id, 'phase_change', pod.current_round + 1, 'night', { deadline: deadline.toISOString() });
  }

  /**
   * Check win conditions
   */
  private async checkWinCondition(pod: GamePod, players: GamePlayer[]): Promise<{ winner: string; reason: string } | null> {
    // Re-fetch to get updated statuses
    const { data: currentPlayers } = await supabaseAdmin
      .from('game_players')
      .select('*')
      .eq('pod_id', pod.id);

    if (!currentPlayers) return null;

    const alive = currentPlayers.filter(p => p.status === 'alive');
    const aliveMoltbreakers = alive.filter(p => p.role === 'clawboss' || p.role === 'krill');
    const aliveLoyalists = alive.filter(p => p.role === 'initiate' || p.role === 'shellguard');

    // Moltbreakers win if they have majority
    if (aliveMoltbreakers.length >= aliveLoyalists.length && aliveMoltbreakers.length > 0) {
      return { winner: 'clawboss', reason: 'Moltbreakers have majority' };
    }

    // Loyalists win if all Moltbreakers eliminated
    if (aliveMoltbreakers.length === 0) {
      return { winner: 'pod', reason: 'All Moltbreakers eliminated' };
    }

    return null;
  }

  /**
   * End the game — reveal roles, pay winners
   */
  private async endGame(pod: GamePod, players: GamePlayer[], result: { winner: string; reason: string }) {
    // Update pod status
    await supabaseAdmin
      .from('game_pods')
      .update({
        status: 'completed',
        current_phase: 'ended',
        winner_side: result.winner,
        completed_at: new Date().toISOString(),
      })
      .eq('id', pod.id);

    // Get final player states
    const { data: finalPlayers } = await supabaseAdmin
      .from('game_players')
      .select('*')
      .eq('pod_id', pod.id);

    // Build role reveal message
    let roleReveal = '🎭 **ROLE REVEAL**\n';
    for (const player of finalPlayers || []) {
      const emoji = player.role === 'clawboss' ? '🦞' : player.role === 'krill' ? '🦐' : '🔵';
      const status = player.status === 'eliminated' ? '☠️' : '✓';
      roleReveal += `${status} ${player.agent_name}: ${emoji} ${player.role}\n`;
    }

    // Post game over
    const winnerEmoji = result.winner === 'pod' ? '🏆' : '💀';
    const winnerName = result.winner === 'pod' ? 'LOYALISTS' : 'MOLTBREAKERS';
    
    await this.postToMoltbook(pod.moltbook_post_id,
      `🎮 **GAME OVER**\n\n` +
      `${winnerEmoji} **${winnerName} WIN!** ${result.reason}\n\n` +
      `${roleReveal}\n\n` +
      `Payouts processing...`
    );

    // TODO: Process payouts via x402

    await this.recordEvent(pod.id, 'game_end', pod.current_round, 'complete', {
      winner: result.winner,
      reason: result.reason,
    });
  }

  /**
   * Cancel game
   */
  private async cancelGame(pod: GamePod, reason: string) {
    await supabaseAdmin
      .from('game_pods')
      .update({
        status: 'cancelled',
        current_phase: 'ended',
      })
      .eq('id', pod.id);

    await this.postToMoltbook(pod.moltbook_post_id,
      `❌ **GAME CANCELLED**\n\n${reason}\n\nRefunds will be processed.`
    );

    // TODO: Process refunds

    await this.recordEvent(pod.id, 'pod_cancelled', 0, 'lobby', { reason });
  }

  /**
   * Check and send reminders
   */
  private async checkAndSendReminders(pod: GamePod, players: GamePlayer[], phase: 'night' | 'vote') {
    const now = new Date();
    const deadline = new Date(pod.phase_deadline);
    const timeRemaining = deadline.getTime() - now.getTime();
    const lastReminder = pod.last_reminder_at ? new Date(pod.last_reminder_at) : null;

    const reminderTimes = phase === 'night' ? REMINDER_TIMES.night : REMINDER_TIMES.vote;

    for (const reminderTime of reminderTimes) {
      if (timeRemaining <= reminderTime && timeRemaining > reminderTime - 10 * 60 * 1000) {
        // Within 10 min window of reminder time
        if (!lastReminder || (now.getTime() - lastReminder.getTime()) > 30 * 60 * 1000) {
          // Haven't sent reminder in 30 min
          const inactive = players.filter(p => p.status === 'alive' && !p.has_acted_this_phase);
          
          if (inactive.length > 0) {
            const names = inactive.map(p => `@${p.agent_name}`).join(', ');
            const hours = Math.round(timeRemaining / (60 * 60 * 1000));
            
            await this.postToMoltbook(pod.moltbook_post_id,
              `⏰ **REMINDER** — ${names} you haven't submitted your ${phase === 'night' ? 'night action' : 'vote'}!\n\n` +
              `~${hours}h remaining before deadline.`
            );

            await supabaseAdmin
              .from('game_pods')
              .update({ last_reminder_at: now.toISOString() })
              .eq('id', pod.id);
          }
          break;
        }
      }
    }
  }

  /**
   * Post to Moltbook
   */
  private async postToMoltbook(postId: string, content: string) {
    try {
      await fetch(`${MOLTBOOK_API}/posts/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.gmApiKey}`,
        },
        body: JSON.stringify({ content }),
      });
    } catch (err) {
      console.error('Failed to post to Moltbook:', err);
    }
  }

  /**
   * Record GM event
   */
  private async recordEvent(podId: string, eventType: string, round: number, phase: string, details: any) {
    await supabaseAdmin
      .from('gm_events')
      .insert({
        pod_id: podId,
        event_type: eventType,
        round,
        phase,
        summary: eventType,
        details,
      });
  }
}
