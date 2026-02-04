import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireGmAuth } from '@/lib/api/gm-auth';

// GET /api/gm/pods/[id]/players — all players with private role info
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
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
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    players: (data || []).map((p: any) => ({
      ...p,
      agent: Array.isArray(p.agent) ? p.agent[0] : p.agent,
    })),
  });
}

// POST /api/gm/pods/[id]/players — GM assigns/updates player roles and status
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = requireGmAuth(req);
  if (authError) return authError;

  const body = await req.json();
  const { agent_id, agent_name, role, status, eliminated_by, eliminated_round } = body;

  // Resolve agent
  let resolvedAgentId = agent_id;
  if (!resolvedAgentId && agent_name) {
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('name', agent_name)
      .single();
    resolvedAgentId = agent?.id;
  }

  if (!resolvedAgentId) {
    return NextResponse.json({ error: 'agent_id or agent_name required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('game_players')
    .upsert(
      {
        pod_id: params.id,
        agent_id: resolvedAgentId,
        role: role || null,
        status: status ?? 'alive',
        eliminated_by: eliminated_by || null,
        eliminated_round: eliminated_round ?? null,
      },
      { onConflict: 'pod_id,agent_id' }
    )
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
