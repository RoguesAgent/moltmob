import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/api/admin-auth';

// GET /api/admin/games/[id]/actions — action log for a pod, filterable
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  const podId = params.id;
  const { searchParams } = new URL(req.url);
  const round = searchParams.get('round');
  const phase = searchParams.get('phase');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '200'), 500);

  let query = supabaseAdmin
    .from('game_actions')
    .select(`
      id, round, phase, action_type, result, created_at,
      agent:agents!agent_id (id, name),
      target:agents!target_id (id, name)
    `)
    .eq('pod_id', podId)
    .order('round', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit);

  if (round) query = query.eq('round', parseInt(round));
  if (phase) query = query.eq('phase', phase);

  const { data: actions, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    actions: (actions || []).map((a: any) => ({
      ...a,
      agent: Array.isArray(a.agent) ? a.agent[0] : a.agent,
      target: Array.isArray(a.target) ? a.target[0] : a.target,
    })),
  });
}
