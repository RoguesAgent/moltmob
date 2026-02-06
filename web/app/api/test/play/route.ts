import { NextRequest, NextResponse } from 'next/server';
import { requireGmAuth } from '@/lib/api/gm-auth';
import { createPod, joinPod } from '@/lib/game/lobby';
import {
  startGame,
  processNight,
  processVote,
  createOrchestratorState,
  NightActionInput,
  VoteInput,
  GameTransition,
} from '@/lib/game/orchestrator';
import { randomUUID } from 'crypto';

// POST /api/test/play — run a complete auto-played game and return the full log
// Body: { player_count?: number, rounds?: number }
// Returns the full game log: every phase, every action, final result
export async function POST(req: NextRequest) {
  const authError = requireGmAuth(req);
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const playerCount = body.player_count ?? 8;
  const maxRounds = body.rounds ?? 10;

  // Create pod with bots
  const pod = createPod({
    id: randomUUID(),
    pod_number: Math.floor(Math.random() * 9000) + 1000,
    config: { test_mode: true, mock_moltbook: true, max_rounds: maxRounds },
  });

  const botNames = [
    'CrabbyPatton', 'LobsterLord', 'ShrimpScampi', 'PrawnStar',
    'CrawdadKing', 'BarnacleBot', 'CoralCrusher', 'TidePoolTom',
    'HermitHacker', 'KelpKnight', 'ReefRunner', 'SquidSquad',
  ];

  for (let i = 0; i < Math.min(playerCount, 12); i++) {
    joinPod(pod, {
      id: `bot_${i}`,
      agent_name: botNames[i],
      wallet_pubkey: `wallet_bot_${i}`,
      encryption_pubkey: `enc_bot_${i}`,
    });
  }

  // Start game
  const gameLog: { phase: string; round: number; summary: string; details?: any }[] = [];
  let transition = startGame(pod);
  let current = transition.pod;
  const state = createOrchestratorState(current);

  gameLog.push({
    phase: 'start',
    round: 0,
    summary: `Game started with ${current.players.length} players`,
    details: {
      roles: current.players.map((p) => ({ name: p.agent_name, role: p.role })),
    },
  });

  // Auto-play loop
  let round = 0;
  while (current.status === 'active' && round < maxRounds * 2) {
    round++;

    if (current.current_phase === 'night') {
      // Auto night: Clawboss targets a random alive krill
      const alive = current.players.filter((p) => p.status === 'alive');
      const clawboss = alive.find((p) => p.role === 'clawboss');
      const targets = alive.filter((p) => p.role !== 'clawboss');
      const target = targets[Math.floor(Math.random() * targets.length)];

      const actions: NightActionInput[] = alive.map((p) => {
        if (p.id === clawboss?.id && target) {
          return { player_id: p.id, action: 'pinch' as const, target_id: target.id };
        }
        // Shellguard randomly protects someone
        if (p.role === 'shellguard' && !state.shellguardUsed) {
          const protectTarget = targets[Math.floor(Math.random() * targets.length)];
          return { player_id: p.id, action: 'protect' as const, target_id: protectTarget?.id ?? null };
        }
        return { player_id: p.id, action: 'scuttle' as const, target_id: null };
      });

      transition = processNight(current, actions, state);
      current = transition.pod;

      gameLog.push({
        phase: 'night',
        round: current.current_round,
        summary: transition.events.map((e) => e.summary).join(' | '),
        details: { eliminated: transition.eliminatedPlayer },
      });

      if (transition.winResult?.game_over) break;
    }

    if (current.current_phase === 'day') {
      // Skip debate, go straight to vote
      current.current_phase = 'vote';
    }

    if (current.current_phase === 'vote') {
      // Auto vote: town players randomly vote, with bias toward suspicious players
      const alive = current.players.filter((p) => p.status === 'alive');
      const voteTargets = alive.filter((p) => p.role !== 'krill' || Math.random() > 0.5);

      const votes: VoteInput[] = alive.map((p) => {
        // Each player votes for a random other alive player
        const others = alive.filter((o) => o.id !== p.id);
        const target = others[Math.floor(Math.random() * others.length)];
        return { voter_id: p.id, target_id: target?.id ?? null };
      });

      transition = processVote(current, votes, state);
      current = transition.pod;

      gameLog.push({
        phase: 'vote',
        round: current.current_round,
        summary: transition.events.map((e) => e.summary).join(' | '),
        details: { eliminated: transition.eliminatedPlayer, boil: current.boil_meter },
      });

      if (transition.winResult?.game_over) break;
    }

    if (current.current_phase === 'boil') {
      // Auto boil vote — everyone votes for clawboss if known
      const alive = current.players.filter((p) => p.status === 'alive');
      const clawboss = alive.find((p) => p.role === 'clawboss');
      const votes: VoteInput[] = alive.map((p) => ({
        voter_id: p.id,
        target_id: clawboss?.id ?? alive[0].id,
      }));

      const boilTransition = processVote(current, votes, state);
      current = boilTransition.pod;
      transition = boilTransition;

      gameLog.push({
        phase: 'boil',
        round: current.current_round,
        summary: boilTransition.events.map((e) => e.summary).join(' | '),
      });

      if (boilTransition.winResult?.game_over) break;
    }
  }

  // Final summary
  const survivors = current.players.filter((p) => p.status === 'alive');
  const eliminated = current.players.filter((p) => p.status === 'eliminated');

  return NextResponse.json({
    game: {
      pod_id: current.id,
      pod_number: current.pod_number,
      status: current.status,
      winner_side: current.winner_side,
      rounds: current.current_round,
      boil_meter: current.boil_meter,
      final_phase: current.current_phase,
    },
    players: current.players.map((p) => ({
      name: p.agent_name,
      role: p.role,
      status: p.status,
      eliminated_by: p.eliminated_by,
      eliminated_round: p.eliminated_round,
    })),
    survivors: survivors.map((p) => `${p.agent_name} (${p.role})`),
    eliminated: eliminated.map((p) => `${p.agent_name} (${p.role}) — ${p.eliminated_by} R${p.eliminated_round}`),
    payouts: transition.payouts?.map((p) => ({
      player: current.players.find((pl) => pl.id === p.player_id)?.agent_name,
      amount: p.amount,
      reason: p.reason,
    })),
    log: gameLog,
  });
}
