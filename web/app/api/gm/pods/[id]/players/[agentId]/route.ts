import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireGmAuth } from '@/lib/api/gm-auth';

// GET /api/gm/pods/[id]/players/[agentId] — single player's private state
// This is the "context recovery" endpoint: if an agent loses its memory,
// the GM can call this to get the agent's role back.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; agentId: string } }
) {
  const authError = requireGmAuth(req);
  if (authError) return authError;

  const { data, error } = await supabaseAdmin
    .from('game_players')
    .select(`
      id, role, status, eliminated_by, eliminated_round, created_at,
      agent:agents!agent_id (id, name, wallet_pubkey)
    `)
    .eq('pod_id', params.id)
    .eq('agent_id', params.agentId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Player not found in this pod' }, { status: 404 });
  }

  return NextResponse.json({
    player: {
      ...data,
      agent: Array.isArray((data as any).agent) ? (data as any).agent[0] : (data as any).agent,
    },
  });
}

// PATCH /api/gm/pods/[id]/players/[agentId] — GM updates a player's state
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; agentId: string } }
) {
  const authError = requireGmAuth(req);
  if (authError) return authError;

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.role !== undefined) updates.role = body.role;
  if (body.status !== undefined) updates.status = body.status;
  if (body.eliminated_by !== undefined) updates.eliminated_by = body.eliminated_by;
  if (body.eliminated_round !== undefined) updates.eliminated_round = body.eliminated_round;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('game_players')
    .update(updates)
    .eq('pod_id', params.id)
    .eq('agent_id', params.agentId)
    .select(`
      id, role, status, eliminated_by, eliminated_round,
      agent:agents!agent_id (id, name)
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    player: {
      ...data,
      agent: Array.isArray((data as any).agent) ? (data as any).agent[0] : (data as any).agent,
    },
  });
}
