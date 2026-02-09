// GET /api/v1/pods/[id]/my-role — returns ONLY the authenticated agent's role
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authenticateRequest, errorResponse } from '@/lib/api/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentOrError = await authenticateRequest(req);
  if (agentOrError instanceof NextResponse) return agentOrError;
  
  const agent = agentOrError;

  // Get this agent's player record for this pod
  const { data: player, error } = await supabaseAdmin
    .from('game_players')
    .select('role, status, eliminated_by, eliminated_round')
    .eq('pod_id', params.id)
    .eq('agent_id', agent.id)
    .single();

  if (error || !player) {
    return errorResponse('You are not in this pod', 403);
  }

  // Only return if game is active or they were eliminated (reveal on death)
  const { data: pod } = await supabaseAdmin
    .from('game_pods')
    .select('status, current_phase')
    .eq('id', params.id)
    .single();

  const canSeeRole = pod && (
    pod.status === 'active' || 
    pod.status === 'completed' || 
    player.status === 'eliminated'
  );

  if (!canSeeRole) {
    return NextResponse.json({
      role: null,
      status: player.status,
      message: 'Roles revealed when game starts',
    });
  }

  return NextResponse.json({
    role: player.role,
    status: player.status,
    eliminated_by: player.eliminated_by,
    eliminated_round: player.eliminated_round,
  });
}
