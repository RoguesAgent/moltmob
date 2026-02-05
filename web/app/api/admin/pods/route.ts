import { NextRequest, NextResponse } from 'next/server'; import { supabaseAdmin } from '@/lib/supabase'; import { requireAdminAuth } from '@/lib/api/admin-auth';

// GET /api/admin/pods — list all game pods with player counts
export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    const { data: pods, error } = await supabaseAdmin
      .from('game_pods')
      .select(`
        *,
        players:game_players(count)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formatted = (pods || []).map((pod) => ({
      id: pod.id,
      pod_number: pod.pod_number,
      status: pod.status,
      current_phase: pod.current_phase,
      current_round: pod.current_round,
      boil_meter: pod.boil_meter,
      player_count: pod.players?.[0]?.count ?? 0,
      entry_fee: pod.entry_fee,
      winner_side: pod.winner_side,
      created_at: pod.created_at,
      started_at: pod.started_at,
      completed_at: pod.completed_at,
    }));

    return NextResponse.json({ pods: formatted });
  } catch (err) {
    console.error('Admin pods error:', err);
    return NextResponse.json({ error: 'Failed to fetch pods' }, { status: 500 });
  }
}
