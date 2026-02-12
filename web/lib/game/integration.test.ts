/**
 * Integration Tests — Full Async Game Flow
 * 
 * Tests the complete game lifecycle as it would run in production:
 * - GMService polling Moltbook
 * - Comment parsing with encryption
 * - Phase transitions and timeouts
 * - Edge cases and error handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  startGame, 
  processNight, 
  processVote, 
  processMolt,
  processBoilVote,
  createOrchestratorState, 
  NightActionInput, 
  VoteInput,
  OrchestratorState 
} from './orchestrator';
import { createPod, joinPod } from './lobby';
import { parseComment, parseComments, MoltbookComment, PlayerInfo } from './comment-parser';
import { mockPlayer } from './test-helpers';
import { randomUUID } from 'crypto';
import { Pod } from './types';

// ── Test Helpers ──

function makePodWithPlayers(count: number): Pod {
  const pod = createPod({
    id: randomUUID(),
    pod_number: 1001,
    entry_fee: 100_000_000, // 0.1 SOL
    config: { test_mode: true, mock_moltbook: true, max_rounds: 10 },
  });
  
  for (let i = 0; i < count; i++) {
    pod.players.push(mockPlayer(i));
  }
  return pod;
}

function findByRole(pod: Pod, role: string) {
  return pod.players.find(p => p.role === role);
}

function findAllByRole(pod: Pod, role: string) {
  return pod.players.filter(p => p.role === role);
}

function alivePlayers(pod: Pod) {
  return pod.players.filter(p => p.status === 'alive');
}

function makeNightActions(pod: Pod, clawbossTarget: string | null): NightActionInput[] {
  return pod.players
    .filter(p => p.status === 'alive')
    .map(p => {
      if (p.role === 'clawboss') {
        return { player_id: p.id, action: 'pinch' as const, target_id: clawbossTarget };
      }
      if (p.role === 'shellguard') {
        return { player_id: p.id, action: 'protect' as const, target_id: null };
      }
      return { player_id: p.id, action: 'scuttle' as const, target_id: null };
    });
}

function makeVotes(pod: Pod, targetId: string): VoteInput[] {
  return alivePlayers(pod).map(p => ({
    voter_id: p.id,
    target_id: targetId,
  }));
}

// ── Integration Tests ──

describe('Integration: Full Game Lifecycle', () => {
  
  describe('Standard 6-Player Game', () => {
    let pod: Pod;
    let state: OrchestratorState;

    beforeEach(() => {
      pod = makePodWithPlayers(6);
    });

    it('completes a game where loyalists win by voting out clawboss', () => {
      // Start game
      const { pod: started } = startGame(pod);
      state = createOrchestratorState(started);
      
      expect(started.status).toBe('active');
      expect(started.current_phase).toBe('night');
      
      // Verify role distribution for 6 players
      const clawboss = findByRole(started, 'clawboss');
      const krills = findAllByRole(started, 'krill');
      
      expect(clawboss).toBeDefined();
      expect(krills.length).toBeGreaterThanOrEqual(4);

      // Night 1: Clawboss kills a krill
      const target = krills[0];
      const nightActions = makeNightActions(started, target.id);
      const night1 = processNight(started, nightActions, state);
      
      expect(night1.eliminatedPlayer).toBe(target.id);
      expect(night1.pod.current_phase).toBe('day');

      // Vote: Everyone votes clawboss
      night1.pod.current_phase = 'vote';
      const votes = makeVotes(night1.pod, clawboss!.id);
      const voteResult = processVote(night1.pod, votes, state);

      expect(voteResult.winResult?.game_over).toBe(true);
      expect(voteResult.winResult?.winner_side).toBe('pod');
      expect(voteResult.pod.status).toBe('completed');
      
      // Verify payouts exist
      expect(voteResult.payouts).toBeDefined();
      expect(voteResult.payouts!.length).toBeGreaterThan(0);
    });

    it('completes a game where clawboss wins by reaching parity', () => {
      const { pod: started } = startGame(pod);
      state = createOrchestratorState(started);
      
      const clawboss = findByRole(started, 'clawboss')!;
      let current = started;
      let round = 0;

      // Play until clawboss wins or game ends
      while (current.status === 'active' && round < 10) {
        round++;
        
        if (current.current_phase === 'night') {
          // Clawboss targets a random krill
          const targets = alivePlayers(current).filter(p => p.role !== 'clawboss');
          const target = targets[0];
          
          if (target) {
            const actions = makeNightActions(current, target.id);
            const nightResult = processNight(current, actions, state);
            current = nightResult.pod;
            
            if (nightResult.winResult?.game_over) {
              expect(nightResult.winResult.winner_side).toBe('clawboss');
              return;
            }
          }
        }
        
        if (current.current_phase === 'day') {
          current.current_phase = 'vote';
        }
        
        if (current.current_phase === 'vote') {
          // Town votes for a non-clawboss (bad play)
          const nonClawboss = alivePlayers(current).find(p => p.role !== 'clawboss');
          if (nonClawboss) {
            const votes = makeVotes(current, nonClawboss.id);
            const voteResult = processVote(current, votes, state);
            current = voteResult.pod;
            
            if (voteResult.winResult?.game_over) {
              // Could be either side depending on remaining players
              expect(current.status).toBe('completed');
              return;
            }
          }
        }
      }
    });
  });

  describe('Edge Cases', () => {
    
    it('handles tie votes with no elimination', () => {
      const pod = makePodWithPlayers(6);
      const { pod: started } = startGame(pod);
      const state = createOrchestratorState(started);
      
      started.current_phase = 'vote';
      const alive = alivePlayers(started);
      
      // Split votes evenly
      const votes: VoteInput[] = alive.map((p, i) => ({
        voter_id: p.id,
        target_id: alive[i % 2].id, // Alternating targets = tie
      }));
      
      const result = processVote(started, votes, state);
      
      // Tie should result in no elimination
      expect(result.eliminatedPlayer).toBeUndefined();
      expect(result.events.some(e => e.event_type === 'no_cook')).toBe(true);
    });

    it('handles all abstain votes', () => {
      const pod = makePodWithPlayers(6);
      const { pod: started } = startGame(pod);
      const state = createOrchestratorState(started);
      
      started.current_phase = 'vote';
      
      const votes: VoteInput[] = alivePlayers(started).map(p => ({
        voter_id: p.id,
        target_id: null, // Abstain
      }));
      
      const result = processVote(started, votes, state);
      
      expect(result.eliminatedPlayer).toBeUndefined();
      expect(result.pod.boil_meter).toBeGreaterThan(0);
    });

    it('handles clawboss targeting themselves (invalid)', () => {
      const pod = makePodWithPlayers(6);
      const { pod: started } = startGame(pod);
      const state = createOrchestratorState(started);
      
      const clawboss = findByRole(started, 'clawboss')!;
      
      // Clawboss tries to pinch themselves
      const actions: NightActionInput[] = alivePlayers(started).map(p => ({
        player_id: p.id,
        action: p.role === 'clawboss' ? 'pinch' : 'scuttle',
        target_id: p.role === 'clawboss' ? p.id : null, // Self-target
      }));
      
      const result = processNight(started, actions, state);
      
      // Self-pinch should be ignored (no elimination or clawboss still alive)
      expect(result.pod.players.find(p => p.id === clawboss.id)?.status).toBe('alive');
    });

    it('handles shellguard protecting clawboss', () => {
      const pod = makePodWithPlayers(8); // Need 8 for shellguard
      const { pod: started } = startGame(pod);
      const state = createOrchestratorState(started);
      
      const clawboss = findByRole(started, 'clawboss')!;
      const shellguard = findByRole(started, 'shellguard');
      
      if (shellguard) {
        // Shellguard protects clawboss (legal but bad play)
        const actions: NightActionInput[] = alivePlayers(started).map(p => {
          if (p.role === 'clawboss') {
            const krill = started.players.find(pl => pl.role === 'krill')!;
            return { player_id: p.id, action: 'pinch' as const, target_id: krill.id };
          }
          if (p.role === 'shellguard') {
            return { player_id: p.id, action: 'protect' as const, target_id: clawboss.id };
          }
          return { player_id: p.id, action: 'scuttle' as const, target_id: null };
        });
        
        const result = processNight(started, actions, state);
        
        // Krill should still be eliminated (protect on clawboss doesn't help them)
        expect(result.eliminatedPlayer).toBeDefined();
      }
    });

    it('handles molt upgrade giving immunity', () => {
      const pod = makePodWithPlayers(8);
      const { pod: started } = startGame(pod);
      const state = createOrchestratorState(started);
      
      // First go to day phase
      const clawboss = findByRole(started, 'clawboss')!;
      const krill = findAllByRole(started, 'krill')[0];
      
      const nightActions = makeNightActions(started, krill.id);
      const night1 = processNight(started, nightActions, state);
      
      // Now in day phase, trigger molt
      const moltPlayer = alivePlayers(night1.pod).find(p => p.role === 'krill');
      if (moltPlayer && state.moltsRemaining > 0) {
        const moltResult = processMolt(night1.pod, moltPlayer.id, state);
        
        // Molt should generate events
        expect(moltResult.events.length).toBeGreaterThan(0);
        expect(moltResult.moltResult).toBeDefined();
      }
    });

    it('triggers boil phase at high boil meter', () => {
      const pod = makePodWithPlayers(6);
      const { pod: started } = startGame(pod);
      const state = createOrchestratorState(started);
      
      // Artificially set high boil meter
      started.boil_meter = 90;
      started.current_phase = 'vote';
      started.current_round = 5;
      
      // All abstain to trigger boil increase
      const votes: VoteInput[] = alivePlayers(started).map(p => ({
        voter_id: p.id,
        target_id: null,
      }));
      
      const result = processVote(started, votes, state);
      
      // Should either trigger boil phase or increase meter
      expect(result.pod.boil_meter).toBeGreaterThanOrEqual(90);
    });
  });

  describe('Comment Parsing Integration', () => {
    let players: PlayerInfo[];

    beforeEach(() => {
      players = [
        { id: 'p1', agent_name: 'CrabbyPatton', encryption_pubkey: 'key1' },
        { id: 'p2', agent_name: 'LobsterLord', encryption_pubkey: 'key2' },
        { id: 'p3', agent_name: 'ShrimpScampi', encryption_pubkey: 'key3' },
      ];
    });

    it('correctly routes discussion vs action comments', () => {
      const comments: MoltbookComment[] = [
        { id: 'c1', content: 'I suspect LobsterLord...', author: { id: 'a1', name: 'CrabbyPatton' }, created_at: new Date().toISOString() },
        { id: 'c2', content: 'No way, ShrimpScampi is sus!', author: { id: 'a2', name: 'LobsterLord' }, created_at: new Date().toISOString() },
        { id: 'c3', content: '[R1GN:abc:def]', author: { id: 'a1', name: 'CrabbyPatton' }, created_at: new Date().toISOString() },
      ];

      const result = parseComments(comments, players, 1, 'night', null);

      expect(result.discussions).toHaveLength(2);
      expect(result.errors).toHaveLength(1); // Encrypted fails without key
    });

    it('rejects actions from wrong round', () => {
      const comment: MoltbookComment = {
        id: 'c1',
        content: '[R2GN:abc:def]', // Round 2 action in Round 1
        author: { id: 'a1', name: 'CrabbyPatton' },
        created_at: new Date().toISOString(),
      };

      const result = parseComment(comment, players, 1, 'night', null);

      expect(result.type).toBe('invalid');
      expect(result.error).toContain('Wrong round');
    });

    it('rejects night actions during vote phase', () => {
      const comment: MoltbookComment = {
        id: 'c1',
        content: '[R1GN:abc:def]', // Night action format
        author: { id: 'a1', name: 'CrabbyPatton' },
        created_at: new Date().toISOString(),
      };

      const result = parseComment(comment, players, 1, 'vote', null);

      expect(result.type).toBe('invalid');
      expect(result.error).toContain('Wrong phase');
    });

    it('rejects comments from non-players', () => {
      const comment: MoltbookComment = {
        id: 'c1',
        content: '[R1GN:abc:def]',
        author: { id: 'spectator', name: 'RandomSpectator' },
        created_at: new Date().toISOString(),
      };

      const result = parseComment(comment, players, 1, 'night', null);

      expect(result.type).toBe('invalid');
      expect(result.error).toContain('Unknown player');
    });
  });

  describe('Payout Verification', () => {
    
    it('calculates correct payouts when pod wins', () => {
      const pod = makePodWithPlayers(6);
      pod.entry_fee = 100_000_000; // 0.1 SOL each = 0.6 SOL pot
      
      const { pod: started } = startGame(pod);
      const state = createOrchestratorState(started);
      
      const clawboss = findByRole(started, 'clawboss')!;
      
      // Vote out clawboss immediately
      started.current_phase = 'vote';
      const votes = makeVotes(started, clawboss.id);
      const result = processVote(started, votes, state);
      
      expect(result.winResult?.winner_side).toBe('pod');
      expect(result.payouts).toBeDefined();
      
      // Total payouts should be less than pot (rake taken)
      const totalPayout = result.payouts!.reduce((sum, p) => sum + p.amount, 0);
      const pot = 6 * 100_000_000;
      expect(totalPayout).toBeLessThan(pot);
      expect(totalPayout).toBeGreaterThan(0);
    });

    it('calculates correct payouts when clawboss wins', () => {
      const pod = makePodWithPlayers(6);
      pod.entry_fee = 100_000_000;
      
      const { pod: started } = startGame(pod);
      const state = createOrchestratorState(started);
      
      const clawboss = findByRole(started, 'clawboss')!;
      const krills = findAllByRole(started, 'krill');
      
      // Manually eliminate enough krills to reach parity
      let current = started;
      for (let i = 0; i < 4 && current.status === 'active'; i++) {
        const target = krills[i];
        if (target && target.status === 'alive') {
          const actions = makeNightActions(current, target.id);
          const result = processNight(current, actions, state);
          current = result.pod;
          
          if (result.winResult?.game_over) {
            expect(result.winResult.winner_side).toBe('clawboss');
            expect(result.payouts).toBeDefined();
            
            // Clawboss should get payout
            const clawbossPayout = result.payouts!.find(p => p.player_id === clawboss.id);
            expect(clawbossPayout).toBeDefined();
            expect(clawbossPayout!.amount).toBeGreaterThan(0);
            return;
          }
          
          // Skip to next night
          current.current_phase = 'vote';
          const voteResult = processVote(current, alivePlayers(current).map(p => ({
            voter_id: p.id,
            target_id: null,
          })), state);
          current = voteResult.pod;
        }
      }
    });
  });

  describe('Large Game (12 Players)', () => {
    
    it('handles 12-player game with multiple moltbreakers', () => {
      const pod = makePodWithPlayers(12);
      const { pod: started } = startGame(pod);
      const state = createOrchestratorState(started);
      
      // 12 players should have: 1 clawboss, 2 krill, 1 shellguard, 1 initiate, 7 others
      const clawboss = findByRole(started, 'clawboss');
      const shellguard = findByRole(started, 'shellguard');
      const initiate = findByRole(started, 'initiate');
      
      expect(clawboss).toBeDefined();
      expect(shellguard).toBeDefined();
      expect(initiate).toBeDefined();
      
      // All 12 players should have roles
      for (const p of started.players) {
        expect(p.role).not.toBeNull();
      }
    });
  });
});

describe('State Consistency', () => {
  
  it('maintains consistent state through multiple transitions', () => {
    const pod = makePodWithPlayers(8);
    const { pod: started } = startGame(pod);
    const state = createOrchestratorState(started);
    
    let current = started;
    let previousRound = 0;
    
    for (let i = 0; i < 5 && current.status === 'active'; i++) {
      if (current.current_phase === 'night') {
        expect(current.current_round).toBeGreaterThan(previousRound);
        previousRound = current.current_round;
        
        const clawboss = findByRole(current, 'clawboss');
        const target = alivePlayers(current).find(p => p.role === 'krill');
        
        if (clawboss && target) {
          const actions = makeNightActions(current, target.id);
          const result = processNight(current, actions, state);
          current = result.pod;
          
          if (result.winResult?.game_over) break;
        }
      }
      
      if (current.current_phase === 'day') {
        current.current_phase = 'vote';
      }
      
      if (current.current_phase === 'vote') {
        const nonClawboss = alivePlayers(current).find(p => p.role !== 'clawboss');
        if (nonClawboss) {
          const votes = makeVotes(current, nonClawboss.id);
          const result = processVote(current, votes, state);
          current = result.pod;
          
          if (result.winResult?.game_over) break;
        }
      }
      
      // Verify state consistency
      expect(alivePlayers(current).length).toBeLessThanOrEqual(8);
      expect(current.players.length).toBe(8);
      expect(current.boil_meter).toBeGreaterThanOrEqual(0);
      expect(current.boil_meter).toBeLessThanOrEqual(100);
    }
  });
});
