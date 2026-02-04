import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/api/admin-auth';

// GET /api/admin/games — list all pods with player counts
export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);
  const offset = parseInt(searchParams.get('offset') ?? '0');

  let query = supabaseAdmin
    .from('game_pods')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  const { data: pods, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get player counts for each pod
  const podsWithCounts = await Promise.all(
    (pods || []).map(async (pod) => {
      const { count: playerCount } = await supabaseAdmin
        .from('game_players')
        .select('*', { count: 'exact', head: true })
        .eq('pod_id', pod.id);

      const { count: aliveCount } = await supabaseAdmin
        .from('game_players')
        .select('*', { count: 'exact', head: true })
        .eq('pod_id', pod.id)
        .eq('status', 'alive');

      return {
        ...pod,
        player_count: playerCount ?? 0,
        alive_count: aliveCount ?? 0,
      };
    })
  );

  return NextResponse.json({
    pods: podsWithCounts,
    total: count ?? 0,
    has_more: (offset + limit) < (count ?? 0),
  });
}
