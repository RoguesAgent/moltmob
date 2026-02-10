import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authenticateRequest, errorResponse } from '@/lib/api/auth';

// PATCH /api/v1/pods/[id] — update pod status (GM only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: podId } = await params;
  
  const agentOrError = await authenticateRequest(req);
  if (agentOrError instanceof NextResponse) return agentOrError;
  const agent = agentOrError;

  const body = await req.json();
  
  // Only allow updating certain fields
  const allowedFields = ['status', 'current_phase', 'current_round', 'boil_meter', 'winner_side', 'moltbook_post_id'];
  const updates: Record<string, any> = {};
  
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update', 400);
  }

  // Add timestamps
  if (updates.status === 'active' && !body.started_at) {
    updates.started_at = new Date().toISOString();
  }
  if (updates.status === 'completed' && !body.completed_at) {
    updates.completed_at = new Date().toISOString();
  }

  const { data: pod, error } = await supabaseAdmin
    .from('game_pods')
    .update(updates)
    .eq('id', podId)
    .select()
    .single();

  if (error) {
    return errorResponse(`Failed to update pod: ${error.message}`, 500);
  }

  return NextResponse.json({ success: true, pod });
}

// GET /api/v1/pods/[id] — view a single pod (public info only, NO roles)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: podId } = await params;
  
  const agentOrError = await authenticateRequest(req);
  if (agentOrError instanceof NextResponse) return agentOrError;

  const { data: pod, error } = await supabaseAdmin
    .from('game_pods')
    .select('id, pod_number, status, current_phase, current_round, boil_meter, entry_fee, network_name, token, winner_side, created_at, updated_at')
    .eq('id', podId)
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
    .eq('pod_id', podId)
    .order('created_at', { ascending: true });

  // Get published GM events (public announcements)
  const { data: events } = await supabaseAdmin
    .from('gm_events')
    .select('id, round, phase, event_type, summary, created_at')
    .eq('pod_id', podId)
    .order('created_at', { ascending: true });

  // Check if the requesting agent is in this pod
  const agent = agentOrError;
  const { data: myPlayer } = await supabaseAdmin
    .from('game_players')
    .select('status, eliminated_by, eliminated_round')
    .eq('pod_id', podId)
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
