// DEBUG: Run a complete multi-round game simulation
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/api/admin-auth';
import { randomUUID } from 'crypto';

interface GameRound {
  round: number;
  phase: 'night' | 'day';
  events: {
    type: string;
    summary: string;
    message: string;
  }[];
}

export async function POST(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const podId = body.pod_id;
    
    if (!podId) {
      return NextResponse.json({ error: 'pod_id required' }, { status: 400 });
    }

    // Get pod details
    const { data: pod } = await supabaseAdmin
      .from('game_pods')
      .select('id, pod_number')
      .eq('id', podId)
      .single();

    if (!pod) {
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }

    // Get players in pod
    const { data: players } = await supabaseAdmin
      .from('game_players')
      .select('id, agent_id, role, agent:agents!agent_id(name)')
      .eq('pod_id', podId)
      .eq('status', 'alive');

    const playerCount = players?.length || 0;
    if (playerCount === 0) {
      return NextResponse.json({ error: 'No players in pod' }, { status: 400 });
    }

    const results = {
      pod_id: podId,
      pod_number: pod.pod_number,
      events_created: 0,
      actions_created: 0,
      rounds: [] as any[],
    };

    // Define a 3-round game
    const gameRounds: GameRound[] = [
      {
        round: 1,
        phase: 'night',
        events: [
          { type: 'phase_start', summary: 'Night 1 begins', message: '🌙 Night falls. Krill and Clawboss choose victims.' },
          { type: 'night_action', summary: 'Krill attacks', message: 'Krill targets a player...' },
        ],
      },
      {
        round: 1,
        phase: 'day',
        events: [
          { type: 'phase_start', summary: 'Day 1 begins', message: '☀️ Dawn breaks. Discuss and vote!' },
          { type: 'vote_cast', summary: 'Voting phase', message: 'Players cast votes...' },
          { type: 'elimination', summary: 'Player eliminated', message: 'A player was voted off!' },
        ],
      },
      {
        round: 2,
        phase: 'night',
        events: [
          { type: 'phase_start', summary: 'Night 2 begins', message: '🌙 Night falls again...' },
          { type: 'night_action', summary: 'Clawboss acts', message: 'Clawboss makes a move...' },
        ],
      },
      {
        round: 2,
        phase: 'day',
        events: [
          { type: 'phase_start', summary: 'Day 2 begins', message: '☀️ Another day...' },
          { type: 'vote_cast', summary: 'Voting phase', message: 'More votes cast...' },
          { type: 'elimination', summary: 'Player eliminated', message: 'Another player eliminated!' },
        ],
      },
      {
        round: 3,
        phase: 'night',
        events: [
          { type: 'phase_start', summary: 'Final night', message: '🌙 Final night phase...' },
        ],
      },
      {
        round: 3,
        phase: 'day',
        events: [
          { type: 'phase_start', summary: 'Final day', message: '☀️ Final day - last chance to find the Moltbreakers!' },
          { type: 'vote_cast', summary: 'Final vote', message: 'Final voting round...' },
          { type: 'game_end', summary: 'Game Complete!', message: '🎉 Game over! Winners take the pot!' },
        ],
      },
    ];

    // Create events and actions for each round
    for (const gameRound of gameRounds) {
      const roundEvents = [];
      
      for (const event of gameRound.events) {
        const eventId = randomUUID();
        const { error: eventError } = await supabaseAdmin.from('gm_events').insert({
          id: eventId,
          pod_id: podId,
          event_type: event.type,
          summary: event.summary,
          round: gameRound.round,
          phase: gameRound.phase,
          details: {
            message: event.message,
            timestamp: Date.now(),
          },
          created_at: new Date(Date.now() - (6 - gameRounds.indexOf(gameRound)) * 60000).toISOString(),
        });

        if (!eventError) {
          results.events_created++;
          roundEvents.push({ id: eventId, type: event.type, summary: event.summary });
        }

        // Create actions for night/day events
        if (event.type === 'night_action' && players && players.length > 0) {
          const krillPlayers = players.filter((p: any) => p.role === 'krill');
          const target = players[Math.floor(Math.random() * players.length)];
          
          for (const krill of krillPlayers.slice(0, 1)) {
            await supabaseAdmin.from('game_actions').insert({
              id: randomUUID(),
              pod_id: podId,
              round: gameRound.round,
              phase: gameRound.phase,
              agent_id: krill.agent_id,
              action_type: 'kill',
              target_id: target.agent_id,
              result: { success: true, message: 'Target marked for elimination' },
              created_at: new Date(Date.now() - (6 - gameRounds.indexOf(gameRound)) * 60000 + 1000).toISOString(),
            });
            results.actions_created++;
          }
        }

        if (event.type === 'vote_cast' && players && players.length > 0) {
          const randomVoter = players[Math.floor(Math.random() * players.length)];
          const randomTarget = players[Math.floor(Math.random() * players.length)];
          
          await supabaseAdmin.from('game_actions').insert({
            id: randomUUID(),
            pod_id: podId,
            round: gameRound.round,
            phase: gameRound.phase,
            agent_id: randomVoter.agent_id,
            action_type: 'vote',
            target_id: randomTarget.agent_id,
            result: { encrypted: true },
            created_at: new Date(Date.now() - (6 - gameRounds.indexOf(gameRound)) * 60000 + 2000).toISOString(),
          });
          results.actions_created++;
        }
      }

      results.rounds.push({
        round: gameRound.round,
        phase: gameRound.phase,
        events: roundEvents,
      });

      // Update pod phase/round
      await supabaseAdmin
        .from('game_pods')
        .update({
          current_round: gameRound.round,
          current_phase: gameRound.phase,
        })
        .eq('id', podId);
    }

    return NextResponse.json({
      success: true,
      ...results,
    });

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
