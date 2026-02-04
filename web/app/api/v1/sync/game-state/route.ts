import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authenticateRequest, errorResponse } from '@/lib/api/auth';

// POST /api/v1/sync/game-state — push full pod state into our DB for admin viewing
export async function POST(req: NextRequest) {
  const agentOrError = await authenticateRequest(req);
  if (agentOrError instanceof NextResponse) return agentOrError;

  try {
    const body = await req.json();
    const { pod, players, actions } = body;

    if (!pod || !pod.id) {
      return errorResponse('pod.id is required', 400);
    }

    // Upsert the pod
    const { error: podError } = await supabaseAdmin
      .from('game_pods')
      .upsert(
        {
          id: pod.id,
          pod_number: pod.pod_number ?? 0,
          status: pod.status ?? 'lobby',
          current_phase: pod.current_phase ?? 'lobby',
          current_round: pod.current_round ?? 0,
          boil_meter: pod.boil_meter ?? 0,
          entry_fee: pod.entry_fee ?? 10_000_000,
          network_name: pod.network_name ?? 'solana-devnet',
          token: pod.token ?? 'WSOL',
          winner_side: pod.winner_side || null,
        },
        { onConflict: 'id' }
      );

    if (podError) {
      return errorResponse(`Pod sync failed: ${podError.message}`, 500);
    }

    // Upsert players
    let playersSynced = 0;
    if (Array.isArray(players)) {
      for (const player of players) {
        // Resolve agent by name or ID
        let agentId = player.agent_id;
        if (!agentId && player.agent_name) {
          const { data: agent } = await supabaseAdmin
            .from('agents')
            .select('id')
            .eq('name', player.agent_name)
            .single();
          agentId = agent?.id;
        }

        if (!agentId) continue;

        const { error } = await supabaseAdmin
          .from('game_players')
          .upsert(
            {
              pod_id: pod.id,
              agent_id: agentId,
              role: player.role || null,
              status: player.status ?? 'alive',
              eliminated_by: player.eliminated_by || null,
              eliminated_round: player.eliminated_round ?? null,
            },
            { onConflict: 'pod_id,agent_id' }
          );

        if (!error) playersSynced++;
      }
    }

    // Insert actions (append-only log, no upsert)
    let actionsSynced = 0;
    if (Array.isArray(actions)) {
      for (const action of actions) {
        let agentId = action.agent_id;
        if (!agentId && action.agent_name) {
          const { data: agent } = await supabaseAdmin
            .from('agents')
            .select('id')
            .eq('name', action.agent_name)
            .single();
          agentId = agent?.id;
        }

        if (!agentId) continue;

        let targetId = action.target_id || null;
        if (!targetId && action.target_name) {
          const { data: target } = await supabaseAdmin
            .from('agents')
            .select('id')
            .eq('name', action.target_name)
            .single();
          targetId = target?.id || null;
        }

        const { error } = await supabaseAdmin
          .from('game_actions')
          .insert({
            pod_id: pod.id,
            round: action.round,
            phase: action.phase,
            agent_id: agentId,
            action_type: action.action_type,
            target_id: targetId,
            result: action.result || null,
          });

        if (!error) actionsSynced++;
      }
    }

    return NextResponse.json({
      success: true,
      pod_id: pod.id,
      players_synced: playersSynced,
      actions_synced: actionsSynced,
    });
  } catch {
    return errorResponse('Invalid request body', 400);
  }
}
