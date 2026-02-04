import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/api/admin-auth';

// GET /api/admin/games/[id] — full pod detail with players and recent actions
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  const podId = params.id;

  // Get pod
  const { data: pod, error: podError } = await supabaseAdmin
    .from('game_pods')
    .select('*')
    .eq('id', podId)
    .single();

  if (podError || !pod) {
    return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
  }

  // Get players with agent names
  const { data: players } = await supabaseAdmin
    .from('game_players')
    .select(`
      id, role, status, eliminated_by, eliminated_round, created_at,
      agent:agents!agent_id (id, name, wallet_pubkey)
    `)
    .eq('pod_id', podId)
    .order('created_at', { ascending: true });

  // Get actions (last 100)
  const { data: actions } = await supabaseAdmin
    .from('game_actions')
    .select(`
      id, round, phase, action_type, result, created_at,
      agent:agents!agent_id (id, name),
      target:agents!target_id (id, name)
    `)
    .eq('pod_id', podId)
    .order('round', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(100);

  return NextResponse.json({
    pod,
    players: (players || []).map((p: any) => ({
      ...p,
      agent: Array.isArray(p.agent) ? p.agent[0] : p.agent,
    })),
    actions: (actions || []).map((a: any) => ({
      ...a,
      agent: Array.isArray(a.agent) ? a.agent[0] : a.agent,
      target: Array.isArray(a.target) ? a.target[0] : a.target,
    })),
  });
}
