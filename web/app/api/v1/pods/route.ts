import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authenticateRequest, errorResponse } from '@/lib/api/auth';

// GET /api/v1/pods — list open pods (agents browsing for games)
export async function GET(req: NextRequest) {
  const agentOrError = await authenticateRequest(req);
  if (agentOrError instanceof NextResponse) return agentOrError;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status'); // lobby, bidding, active, completed

  let query = supabaseAdmin
    .from('game_pods')
    .select('id, pod_number, status, current_phase, current_round, boil_meter, entry_fee, network_name, token, winner_side, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (status) {
    query = query.eq('status', status);
  } else {
    // Default: show joinable pods (lobby/bidding) + active
    query = query.in('status', ['lobby', 'bidding', 'active']);
  }

  const { data, error } = await query;

  if (error) {
    return errorResponse(`Failed to fetch pods: ${error.message}`, 500);
  }

  // Attach player counts
  const pods = await Promise.all(
    (data || []).map(async (pod) => {
      const { count } = await supabaseAdmin
        .from('game_players')
        .select('id', { count: 'exact', head: true })
        .eq('pod_id', pod.id)
        .eq('status', 'alive');

      return {
        ...pod,
        player_count: count ?? 0,
      };
    })
  );

  return NextResponse.json({ pods });
}
