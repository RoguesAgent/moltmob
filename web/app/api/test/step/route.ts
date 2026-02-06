import { NextRequest, NextResponse } from 'next/server';
import { requireGmAuth } from '@/lib/api/gm-auth';
import { createPod, joinPod } from '@/lib/game/lobby';
import {
  startGame,
  processNight,
  processVote,
  processMolt,
  processBoilVote,
  createOrchestratorState,
  NightActionInput,
  VoteInput,
} from '@/lib/game/orchestrator';
import type { OrchestratorState } from '@/lib/game/orchestrator';
import { Pod } from '@/lib/game/types';

// In-memory game sessions for step-by-step testing
// In production, state would be in Supabase. This is test-only.
const sessions = new Map<string, { pod: Pod; state: OrchestratorState }>();

// POST /api/test/step — step through a game one phase at a time
// Body:
//   { action: 'create', player_count?: number }
//   { action: 'start', session_id: string }
//   { action: 'night', session_id: string, actions?: NightActionInput[] }
//   { action: 'vote', session_id: string, votes?: VoteInput[] }
//   { action: 'molt', session_id: string, player_id: string }
//   { action: 'state', session_id: string }
export async function POST(req: NextRequest) {
  const authError = requireGmAuth(req);
  if (authError) return authError;

  const body = await req.json();
  const { action } = body;

  switch (action) {
    case 'create': {
      const count = body.player_count ?? 8;
      const pod = createPod({
        id: `test-${Date.now()}`,
        pod_number: Math.floor(Math.random() * 9000) + 1000,
        config: { test_mode: true, mock_moltbook: true },
      });

      const names = ['CrabbyPatton', 'LobsterLord', 'ShrimpScampi', 'PrawnStar',
        'CrawdadKing', 'BarnacleBot', 'CoralCrusher', 'TidePoolTom',
        'HermitHacker', 'KelpKnight', 'ReefRunner', 'SquidSquad'];

      for (let i = 0; i < Math.min(count, 12); i++) {
        joinPod(pod, {
          id: `bot_${i}`,
          agent_name: names[i],
          wallet_pubkey: `wallet_bot_${i}`,
          encryption_pubkey: `enc_bot_${i}`,
        });
      }

      const sessionId = pod.id;
      sessions.set(sessionId, { pod, state: createOrchestratorState(pod) });

      return NextResponse.json({
        session_id: sessionId,
        pod_number: pod.pod_number,
        players: pod.players.map((p) => ({ id: p.id, name: p.agent_name })),
        message: `Test session created. Use action: 'start' to begin.`,
      }, { status: 201 });
    }

    case 'start': {
      const session = sessions.get(body.session_id);
      if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

      const transition = startGame(session.pod);
      session.pod = transition.pod;
      session.state = createOrchestratorState(session.pod);

      return NextResponse.json({
        phase: session.pod.current_phase,
        round: session.pod.current_round,
        roles: session.pod.players.map((p) => ({ name: p.agent_name, role: p.role })),
        events: transition.events.map((e) => e.summary),
      });
    }

    case 'night': {
      const session = sessions.get(body.session_id);
      if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

      let actions: NightActionInput[] = body.actions;

      // Auto-generate if not provided
      if (!actions) {
        const alive = session.pod.players.filter((p) => p.status === 'alive');
        const clawboss = alive.find((p) => p.role === 'clawboss');
        const targets = alive.filter((p) => p.id !== clawboss?.id);
        const target = targets[Math.floor(Math.random() * targets.length)];

        actions = alive.map((p) => {
          if (p.id === clawboss?.id) return { player_id: p.id, action: 'pinch' as const, target_id: target?.id ?? null };
          return { player_id: p.id, action: 'scuttle' as const, target_id: null };
        });
      }

      const transition = processNight(session.pod, actions, session.state);
      session.pod = transition.pod;

      return NextResponse.json({
        phase: session.pod.current_phase,
        round: session.pod.current_round,
        eliminated: transition.eliminatedPlayer,
        game_over: transition.winResult?.game_over ?? false,
        winner: transition.winResult?.winner_side ?? null,
        events: transition.events.map((e) => e.summary),
        alive: session.pod.players.filter((p) => p.status === 'alive').map((p) => p.agent_name),
      });
    }

    case 'vote': {
      const session = sessions.get(body.session_id);
      if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

      let votes: VoteInput[] = body.votes;

      // Auto-generate if not provided
      if (!votes) {
        const alive = session.pod.players.filter((p) => p.status === 'alive');
        votes = alive.map((p) => {
          const others = alive.filter((o) => o.id !== p.id);
          const target = others[Math.floor(Math.random() * others.length)];
          return { voter_id: p.id, target_id: target?.id ?? null };
        });
      }

      session.pod.current_phase = 'vote';
      const transition = processVote(session.pod, votes, session.state);
      session.pod = transition.pod;

      return NextResponse.json({
        phase: session.pod.current_phase,
        round: session.pod.current_round,
        eliminated: transition.eliminatedPlayer,
        boil: session.pod.boil_meter,
        game_over: transition.winResult?.game_over ?? false,
        winner: transition.winResult?.winner_side ?? null,
        events: transition.events.map((e) => e.summary),
        alive: session.pod.players.filter((p) => p.status === 'alive').map((p) => p.agent_name),
        payouts: transition.payouts?.map((p) => ({
          player: session.pod.players.find((pl) => pl.id === p.player_id)?.agent_name,
          amount: p.amount,
          reason: p.reason,
        })),
      });
    }

    case 'molt': {
      const session = sessions.get(body.session_id);
      if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

      const transition = processMolt(session.pod, body.player_id, session.state);
      session.pod = transition.pod;

      return NextResponse.json({
        molt_result: transition.moltResult,
        events: transition.events.map((e) => e.summary),
        molts_remaining: session.state.moltsRemaining,
      });
    }

    case 'state': {
      const session = sessions.get(body.session_id);
      if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

      return NextResponse.json({
        pod: {
          id: session.pod.id,
          status: session.pod.status,
          phase: session.pod.current_phase,
          round: session.pod.current_round,
          boil: session.pod.boil_meter,
          winner: session.pod.winner_side,
        },
        players: session.pod.players.map((p) => ({
          id: p.id,
          name: p.agent_name,
          role: p.role,
          status: p.status,
          eliminated_by: p.eliminated_by,
          eliminated_round: p.eliminated_round,
        })),
        molts_remaining: session.state.moltsRemaining,
        shellguard_used: session.state.shellguardUsed,
      });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
