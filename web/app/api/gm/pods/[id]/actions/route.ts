import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireGmAuth } from '@/lib/api/gm-auth';

// GET /api/gm/pods/[id]/actions — all actions (private: includes night actions)
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = requireGmAuth(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const round = searchParams.get('round');
  const phase = searchParams.get('phase');

  let query = supabaseAdmin
    .from('game_actions')
    .select(`
      id, round, phase, action_type, result, created_at,
      agent:agents!agent_id (id, name),
      target:agents!target_id (id, name)
    `)
    .eq('pod_id', params.id)
    .order('round', { ascending: true })
    .order('created_at', { ascending: true });

  if (round) query = query.eq('round', parseInt(round));
  if (phase) query = query.eq('phase', phase);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    actions: (data || []).map((a: any) => ({
      ...a,
      agent: Array.isArray(a.agent) ? a.agent[0] : a.agent,
      target: Array.isArray(a.target) ? a.target[0] : a.target,
    })),
  });
}

// POST /api/gm/pods/[id]/actions — GM records an action
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = requireGmAuth(req);
  if (authError) return authError;

  const body = await req.json();
  const { round, phase, agent_id, agent_name, action_type, target_id, target_name, result } = body;

  if (!round || !phase || !action_type) {
    return NextResponse.json({ error: 'round, phase, action_type required' }, { status: 400 });
  }

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

  // Resolve target
  let resolvedTargetId = target_id || null;
  if (!resolvedTargetId && target_name) {
    const { data: target } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('name', target_name)
      .single();
    resolvedTargetId = target?.id || null;
  }

  const { data, error } = await supabaseAdmin
    .from('game_actions')
    .insert({
      pod_id: params.id,
      round,
      phase,
      agent_id: resolvedAgentId,
      action_type,
      target_id: resolvedTargetId,
      result: result || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ action: data }, { status: 201 });
}
