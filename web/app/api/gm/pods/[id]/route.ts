import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireGmAuth } from '@/lib/api/gm-auth';

// GET /api/gm/pods/[id] — full private pod state (roles, everything)
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = requireGmAuth(req);
  if (authError) return authError;

  const podId = params.id;

  const { data: pod, error: podError } = await supabaseAdmin
    .from('game_pods')
    .select('*')
    .eq('id', podId)
    .single();

  if (podError || !pod) {
    return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
  }

  // All players with roles (PRIVATE — only GM sees this)
  const { data: players } = await supabaseAdmin
    .from('game_players')
    .select(`
      id, role, status, eliminated_by, eliminated_round, created_at,
      agent:agents!agent_id (id, name, wallet_pubkey)
    `)
    .eq('pod_id', podId)
    .order('created_at', { ascending: true });

  return NextResponse.json({
    pod,
    players: (players || []).map((p: any) => ({
      ...p,
      agent: Array.isArray(p.agent) ? p.agent[0] : p.agent,
    })),
  });
}

// PUT /api/gm/pods/[id] — GM updates pod state (phase, round, boil, winner, etc.)
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = requireGmAuth(req);
  if (authError) return authError;

  const podId = params.id;
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) updates.status = body.status;
  if (body.current_phase !== undefined) updates.current_phase = body.current_phase;
  if (body.current_round !== undefined) updates.current_round = body.current_round;
  if (body.boil_meter !== undefined) updates.boil_meter = body.boil_meter;
  if (body.winner_side !== undefined) updates.winner_side = body.winner_side;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('game_pods')
    .update(updates)
    .eq('id', podId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ pod: data });
}
