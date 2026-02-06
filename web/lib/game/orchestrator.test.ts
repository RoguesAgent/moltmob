import { describe, it, expect } from 'vitest';
import {
  startGame,
  processNight,
  processVote,
  processMolt,
  processBoilVote,
  createOrchestratorState,
  NightActionInput,
  VoteInput,
} from './orchestrator';
import { createPod } from './lobby';
import { mockPlayer } from './test-helpers';

function makePod(playerCount: number = 8) {
  const pod = createPod({ id: 'test-pod', pod_number: 42, config: { test_mode: true, mock_moltbook: true } });
  for (let i = 0; i < playerCount; i++) {
    pod.players.push(mockPlayer(i));
  }
  return pod;
}

function findByRole(pod: ReturnType<typeof makePod>, role: string) {
  return pod.players.find((p) => p.role === role);
}

function aliveIds(pod: ReturnType<typeof makePod>) {
  return pod.players.filter((p) => p.status === 'alive').map((p) => p.id);
}

describe('startGame', () => {
  it('assigns roles and transitions to night', () => {
    const pod = makePod(8);
    const result = startGame(pod);

    expect(result.pod.status).toBe('active');
    expect(result.pod.current_phase).toBe('night');
    expect(result.pod.current_round).toBe(1);

    // All players have roles
    for (const p of result.pod.players) {
      expect(p.role).not.toBeNull();
    }

    // Exactly 1 clawboss, 1 shellguard, 1 initiate (for 8 players)
    const roles = result.pod.players.map((p) => p.role);
    expect(roles.filter((r) => r === 'clawboss')).toHaveLength(1);
    expect(roles.filter((r) => r === 'shellguard')).toHaveLength(1);
    expect(roles.filter((r) => r === 'initiate')).toHaveLength(1);
    expect(roles.filter((r) => r === 'krill').length).toBeGreaterThanOrEqual(4);

    // Events generated
    expect(result.events.some((e) => e.event_type === 'roles_assigned')).toBe(true);
    expect(result.events.some((e) => e.event_type === 'game_start')).toBe(true);
    expect(result.events.some((e) => e.event_type === 'phase_change')).toBe(true);

    // Moltbook posts generated
    expect(result.posts.length).toBeGreaterThanOrEqual(2);
  });
});

describe('processNight', () => {
  it('eliminates pinch target when unprotected', () => {
    const pod = makePod(8);
    const { pod: started } = startGame(pod);
    const state = createOrchestratorState(started);

    const clawboss = findByRole(started, 'clawboss')!;
    const target = started.players.find((p) => p.role === 'krill')!;

    const actions: NightActionInput[] = started.players
      .filter((p) => p.status === 'alive')
      .map((p) => {
        if (p.id === clawboss.id) return { player_id: p.id, action: 'pinch' as const, target_id: target.id };
        return { player_id: p.id, action: 'scuttle' as const, target_id: null };
      });

    const result = processNight(started, actions, state);

    expect(result.eliminatedPlayer).toBe(target.id);
    expect(result.pod.current_phase).toBe('day');
    expect(result.pod.players.find((p) => p.id === target.id)!.status).toBe('eliminated');
    expect(result.events.some((e) => e.event_type === 'night_resolved')).toBe(true);
  });

  it('blocks pinch when Shellguard protects the target', () => {
    const pod = makePod(8);
    const { pod: started } = startGame(pod);
    const state = createOrchestratorState(started);

    const clawboss = findByRole(started, 'clawboss')!;
    const shellguard = findByRole(started, 'shellguard')!;
    const target = started.players.find((p) => p.role === 'krill')!;

    const actions: NightActionInput[] = started.players
      .filter((p) => p.status === 'alive')
      .map((p) => {
        if (p.id === clawboss.id) return { player_id: p.id, action: 'pinch' as const, target_id: target.id };
        if (p.id === shellguard.id) return { player_id: p.id, action: 'protect' as const, target_id: target.id };
        return { player_id: p.id, action: 'scuttle' as const, target_id: null };
      });

    const result = processNight(started, actions, state);

    expect(result.eliminatedPlayer).toBeUndefined();
    expect(result.pod.players.find((p) => p.id === target.id)!.status).toBe('alive');
    expect(result.events.some((e) => e.event_type === 'pinch_blocked')).toBe(true);
  });

  it('ends game when Clawboss kills enough to reach parity', () => {
    // 6 players: 5 krill + 1 clawboss. Kill 4 krill → 1 krill + 1 clawboss = parity
    const pod = makePod(6);
    const { pod: started } = startGame(pod);
    const state = createOrchestratorState(started);

    const clawboss = findByRole(started, 'clawboss')!;
    const krills = started.players.filter((p) => p.role === 'krill');

    // Manually eliminate 3 krill to set up near-parity
    krills[0].status = 'eliminated';
    krills[0].eliminated_by = 'pinched';
    krills[1].status = 'eliminated';
    krills[1].eliminated_by = 'pinched';
    krills[2].status = 'eliminated';
    krills[2].eliminated_by = 'pinched';
    started.current_round = 4;

    // Now: 2 krill alive + 1 clawboss. Kill 1 more → 1 krill + 1 clawboss = parity
    const targetKrill = krills[3];

    const actions: NightActionInput[] = started.players
      .filter((p) => p.status === 'alive')
      .map((p) => {
        if (p.id === clawboss.id) return { player_id: p.id, action: 'pinch' as const, target_id: targetKrill.id };
        return { player_id: p.id, action: 'scuttle' as const, target_id: null };
      });

    const result = processNight(started, actions, state);

    expect(result.winResult).toBeDefined();
    expect(result.winResult!.game_over).toBe(true);
    expect(result.winResult!.winner_side).toBe('clawboss');
    expect(result.pod.status).toBe('completed');
    expect(result.payouts).toBeDefined();
    expect(result.payouts!.length).toBeGreaterThan(0);
  });
});

describe('processVote', () => {
  it('eliminates the target with most votes', () => {
    const pod = makePod(8);
    const { pod: started } = startGame(pod);
    const state = createOrchestratorState(started);
    started.current_phase = 'vote';

    const target = started.players.find((p) => p.role === 'krill')!;
    const voters = started.players.filter((p) => p.status === 'alive' && p.id !== target.id);

    const votes: VoteInput[] = voters.map((v) => ({
      voter_id: v.id,
      target_id: target.id,
    }));

    const result = processVote(started, votes, state);

    expect(result.eliminatedPlayer).toBe(target.id);
    expect(result.pod.players.find((p) => p.id === target.id)!.status).toBe('eliminated');
    expect(result.events.some((e) => e.event_type === 'vote_result')).toBe(true);
  });

  it('ends game when Clawboss is voted out', () => {
    const pod = makePod(8);
    const { pod: started } = startGame(pod);
    const state = createOrchestratorState(started);
    started.current_phase = 'vote';

    const clawboss = findByRole(started, 'clawboss')!;
    const voters = started.players.filter((p) => p.status === 'alive' && p.id !== clawboss.id);

    const votes: VoteInput[] = voters.map((v) => ({
      voter_id: v.id,
      target_id: clawboss.id,
    }));

    const result = processVote(started, votes, state);

    expect(result.winResult).toBeDefined();
    expect(result.winResult!.game_over).toBe(true);
    expect(result.winResult!.winner_side).toBe('pod');
    expect(result.pod.status).toBe('completed');
    expect(result.payouts).toBeDefined();
  });

  it('increases boil meter on no-cook', () => {
    const pod = makePod(8);
    const { pod: started } = startGame(pod);
    const state = createOrchestratorState(started);
    started.current_phase = 'vote';

    // All abstain
    const votes: VoteInput[] = started.players
      .filter((p) => p.status === 'alive')
      .map((v) => ({ voter_id: v.id, target_id: null }));

    const result = processVote(started, votes, state);

    expect(result.eliminatedPlayer).toBeUndefined();
    expect(result.pod.boil_meter).toBeGreaterThan(0);
    expect(result.events.some((e) => e.event_type === 'boil_increase')).toBe(true);
  });

  it('advances to next night after vote', () => {
    const pod = makePod(8);
    const { pod: started } = startGame(pod);
    const state = createOrchestratorState(started);
    started.current_phase = 'vote';
    started.current_round = 1;

    const target = started.players.find((p) => p.role === 'krill')!;
    const votes: VoteInput[] = started.players
      .filter((p) => p.status === 'alive' && p.id !== target.id)
      .map((v) => ({ voter_id: v.id, target_id: target.id }));

    const result = processVote(started, votes, state);

    // Should not be game over (just eliminated a krill)
    if (!result.winResult?.game_over) {
      expect(result.pod.current_phase).toBe('night');
      expect(result.pod.current_round).toBe(2);
    }
  });
});

describe('processMolt', () => {
  it('processes a molt during day phase', () => {
    const pod = makePod(8);
    const { pod: started } = startGame(pod);
    const state = createOrchestratorState(started);
    started.current_phase = 'day';

    const krill = started.players.find((p) => p.role === 'krill')!;
    const result = processMolt(started, krill.id, state);

    expect(result.events.some((e) => e.event_type === 'molt_triggered')).toBe(true);
    expect(result.posts.length).toBeGreaterThan(0);
    expect(state.moltsRemaining).toBeLessThan(maxMoltsForGame(8));
  });

  it('rejects molt when none remaining', () => {
    const pod = makePod(8);
    const { pod: started } = startGame(pod);
    const state = createOrchestratorState(started);
    state.moltsRemaining = 0;

    const krill = started.players.find((p) => p.role === 'krill')!;
    const result = processMolt(started, krill.id, state);

    expect(result.events[0].summary).toContain('no molts remain');
  });
});

describe('processBoilVote', () => {
  it('eliminates in sudden death and checks win', () => {
    const pod = makePod(6);
    const { pod: started } = startGame(pod);
    started.current_phase = 'boil';
    started.boil_meter = 100;

    const clawboss = findByRole(started, 'clawboss')!;
    const voters = started.players.filter((p) => p.status === 'alive' && p.id !== clawboss.id);

    const votes: VoteInput[] = voters.map((v) => ({
      voter_id: v.id,
      target_id: clawboss.id,
    }));

    const result = processBoilVote(started, votes);

    expect(result.winResult).toBeDefined();
    expect(result.winResult!.game_over).toBe(true);
    expect(result.winResult!.winner_side).toBe('pod');
  });
});

describe('Full game flow', () => {
  it('plays a complete game: start → night → day → vote → end', () => {
    const pod = makePod(8);

    // Start
    const { pod: game } = startGame(pod);
    const state = createOrchestratorState(game);
    expect(game.current_phase).toBe('night');

    const clawboss = findByRole(game, 'clawboss')!;
    const krill1 = game.players.find((p) => p.role === 'krill')!;

    // Night 1: Clawboss kills a krill
    const nightActions: NightActionInput[] = game.players
      .filter((p) => p.status === 'alive')
      .map((p) => {
        if (p.id === clawboss.id) return { player_id: p.id, action: 'pinch' as const, target_id: krill1.id };
        return { player_id: p.id, action: 'scuttle' as const, target_id: null };
      });

    const night1 = processNight(game, nightActions, state);
    expect(night1.pod.current_phase).toBe('day');
    expect(night1.eliminatedPlayer).toBe(krill1.id);

    // Day 1: (debate happens on Moltbook, no orchestrator action needed)
    // Vote 1: Town votes out the Clawboss
    const alive = night1.pod.players.filter((p) => p.status === 'alive');
    const voteActions: VoteInput[] = alive.map((v) => ({
      voter_id: v.id,
      target_id: clawboss.id,
    }));

    night1.pod.current_phase = 'vote';
    const vote1 = processVote(night1.pod, voteActions, state);

    // Clawboss should be eliminated → pod wins
    expect(vote1.winResult).toBeDefined();
    expect(vote1.winResult!.game_over).toBe(true);
    expect(vote1.winResult!.winner_side).toBe('pod');
    expect(vote1.pod.status).toBe('completed');
    expect(vote1.payouts!.length).toBeGreaterThan(0);
  });

  it('Clawboss wins by reaching parity over multiple rounds', () => {
    // 6 players: 5 krill + 1 clawboss
    const pod = makePod(6);
    const { pod: game } = startGame(pod);
    const state = createOrchestratorState(game);

    const clawboss = findByRole(game, 'clawboss')!;
    const krills = game.players.filter((p) => p.role === 'krill');

    // Night 1: kill krill[0]
    let current = game;
    let nightActions: NightActionInput[] = current.players
      .filter((p) => p.status === 'alive')
      .map((p) => {
        if (p.id === clawboss.id) return { player_id: p.id, action: 'pinch' as const, target_id: krills[0].id };
        return { player_id: p.id, action: 'scuttle' as const, target_id: null };
      });

    let nightResult = processNight(current, nightActions, state);
    current = nightResult.pod;
    expect(nightResult.eliminatedPlayer).toBe(krills[0].id);
    expect(nightResult.winResult?.game_over).toBeFalsy();

    // Vote 1: no-cook (all abstain)
    current.current_phase = 'vote';
    let voteResult = processVote(current, current.players.filter((p) => p.status === 'alive').map((p) => ({
      voter_id: p.id, target_id: null,
    })), state);
    current = voteResult.pod;
    expect(voteResult.winResult?.game_over).toBeFalsy();

    // Night 2: kill krill[1]
    nightActions = current.players
      .filter((p) => p.status === 'alive')
      .map((p) => {
        if (p.id === clawboss.id) return { player_id: p.id, action: 'pinch' as const, target_id: krills[1].id };
        return { player_id: p.id, action: 'scuttle' as const, target_id: null };
      });

    nightResult = processNight(current, nightActions, state);
    current = nightResult.pod;
    expect(nightResult.eliminatedPlayer).toBe(krills[1].id);

    // Night 2 kill leaves 3 krill + 1 clawboss alive. Not parity yet.
    if (!nightResult.winResult?.game_over) {
      // Vote 2: no-cook again
      current.current_phase = 'vote';
      voteResult = processVote(current, current.players.filter((p) => p.status === 'alive').map((p) => ({
        voter_id: p.id, target_id: null,
      })), state);
      current = voteResult.pod;

      // Night 3: kill krill[2] → 2 krill + 1 clawboss. Still not parity (1 < 2).
      nightActions = current.players
        .filter((p) => p.status === 'alive')
        .map((p) => {
          if (p.id === clawboss.id) return { player_id: p.id, action: 'pinch' as const, target_id: krills[2].id };
          return { player_id: p.id, action: 'scuttle' as const, target_id: null };
        });

      nightResult = processNight(current, nightActions, state);
      current = nightResult.pod;

      if (!nightResult.winResult?.game_over) {
        // Vote 3: no-cook
        current.current_phase = 'vote';
        voteResult = processVote(current, current.players.filter((p) => p.status === 'alive').map((p) => ({
          voter_id: p.id, target_id: null,
        })), state);
        current = voteResult.pod;

        // Night 4: kill krill[3] → 1 krill + 1 clawboss = PARITY
        nightActions = current.players
          .filter((p) => p.status === 'alive')
          .map((p) => {
            if (p.id === clawboss.id) return { player_id: p.id, action: 'pinch' as const, target_id: krills[3].id };
            return { player_id: p.id, action: 'scuttle' as const, target_id: null };
          });

        nightResult = processNight(current, nightActions, state);

        expect(nightResult.winResult).toBeDefined();
        expect(nightResult.winResult!.game_over).toBe(true);
        expect(nightResult.winResult!.winner_side).toBe('clawboss');
        expect(nightResult.pod.status).toBe('completed');
      }
    }
  });
});

// Import for the molt test
import { maxMoltsForGame } from './molt';
