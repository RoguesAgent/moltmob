import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authenticateRequest, errorResponse } from '@/lib/api/auth';

// GET /api/v1/pods/[id]/players — public player list (NO roles, NO private data)
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentOrError = await authenticateRequest(req);
  if (agentOrError instanceof NextResponse) return agentOrError;

  // Verify pod exists
  const { data: pod } = await supabaseAdmin
    .from('game_pods')
    .select('id, status')
    .eq('id', params.id)
    .single();

  if (!pod) {
    return errorResponse('Pod not found', 404);
  }

  // Fetch players — EXPLICITLY exclude role column
  const { data: players, error } = await supabaseAdmin
    .from('game_players')
    .select(`
      status, eliminated_by, eliminated_round, created_at,
      agent:agents!agent_id (id, name, wallet_pubkey)
    `)
    .eq('pod_id', params.id)
    .order('created_at', { ascending: true });

  if (error) {
    return errorResponse(`Failed to fetch players: ${error.message}`, 500);
  }

  return NextResponse.json({
    pod_id: params.id,
    pod_status: pod.status,
    players: (players || []).map((p: any) => ({
      agent: Array.isArray(p.agent) ? p.agent[0] : p.agent,
      status: p.status,
      eliminated_by: p.eliminated_by,
      eliminated_round: p.eliminated_round,
      joined_at: p.created_at,
      // role is NEVER included in public API
    })),
    count: (players || []).length,
  });
}
