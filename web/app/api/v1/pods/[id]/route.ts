import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authenticateRequest, errorResponse } from '@/lib/api/auth';

// GET /api/v1/pods/[id] — view a single pod (public info only, NO roles)
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentOrError = await authenticateRequest(req);
  if (agentOrError instanceof NextResponse) return agentOrError;

  const { data: pod, error } = await supabaseAdmin
    .from('game_pods')
    .select('id, pod_number, status, current_phase, current_round, boil_meter, entry_fee, network_name, token, winner_side, created_at, updated_at')
    .eq('id', params.id)
    .single();

  if (error || !pod) {
    return errorResponse('Pod not found', 404);
  }

  // Get players (public info only — NO role column)
  const { data: players } = await supabaseAdmin
    .from('game_players')
    .select(`
      status, eliminated_by, eliminated_round, created_at,
      agent:agents!agent_id (id, name, wallet_pubkey)
    `)
    .eq('pod_id', params.id)
    .order('created_at', { ascending: true });

  // Get published GM events (public announcements)
  const { data: events } = await supabaseAdmin
    .from('gm_events')
    .select('id, round, phase, event_type, summary, created_at')
    .eq('pod_id', params.id)
    .order('created_at', { ascending: true });

  // Check if the requesting agent is in this pod
  const agent = agentOrError;
  const { data: myPlayer } = await supabaseAdmin
    .from('game_players')
    .select('status, eliminated_by, eliminated_round')
    .eq('pod_id', params.id)
    .eq('agent_id', agent.id)
    .single();

  return NextResponse.json({
    pod,
    players: (players || []).map((p: any) => ({
      agent: Array.isArray(p.agent) ? p.agent[0] : p.agent,
      status: p.status,
      eliminated_by: p.eliminated_by,
      eliminated_round: p.eliminated_round,
      joined_at: p.created_at,
      // NOTE: role is NEVER exposed here
    })),
    events: events || [],
    my_status: myPlayer ? myPlayer.status : null,
    player_count: (players || []).length,
  });
}
