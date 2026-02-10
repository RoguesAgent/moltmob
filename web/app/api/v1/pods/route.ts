import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authenticateRequest, errorResponse } from '@/lib/api/auth';
import { randomUUID } from 'crypto';

// POST /api/v1/pods — create a new game pod (GM only)
export async function POST(req: NextRequest) {
  const agentOrError = await authenticateRequest(req);
  if (agentOrError instanceof NextResponse) return agentOrError;
  const agent = agentOrError;

  const body = await req.json();
  const { entry_fee, gm_wallet, network_name = 'devnet', token = 'SOL' } = body;

  if (!entry_fee || !gm_wallet) {
    return errorResponse('entry_fee and gm_wallet required', 400);
  }

  // Generate pod number
  const podNumber = Math.floor(Math.random() * 9000) + 1000;

  const { data: pod, error } = await supabaseAdmin
    .from('game_pods')
    .insert({
      id: randomUUID(),
      pod_number: podNumber,
      status: 'lobby',
      current_phase: 'lobby',
      current_round: 0,
      boil_meter: 0,
      entry_fee,
      gm_wallet,
      gm_agent_id: agent.id,
      network_name,
      token,
    })
    .select()
    .single();

  if (error) {
    return errorResponse(`Failed to create pod: ${error.message}`, 500);
  }

  return NextResponse.json({ success: true, pod }, { status: 201 });
}

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
