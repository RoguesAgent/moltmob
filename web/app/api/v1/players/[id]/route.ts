import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authenticateRequest, errorResponse } from '@/lib/api/auth';

// PATCH /api/v1/players/[id] — update player (role, status)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: playerId } = await params;
  
  const agentOrError = await authenticateRequest(req);
  if (agentOrError instanceof NextResponse) return agentOrError;

  const body = await req.json();
  const { role, is_alive, status, eliminated_by, eliminated_round } = body;

  const updates: Record<string, unknown> = {};
  if (role !== undefined) updates.role = role;
  // Handle is_alive → status conversion
  if (is_alive !== undefined) {
    updates.status = is_alive ? 'alive' : 'eliminated';
  }
  if (status !== undefined) updates.status = status;
  if (eliminated_by !== undefined) updates.eliminated_by = eliminated_by;
  if (eliminated_round !== undefined) updates.eliminated_round = eliminated_round;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update', 400);
  }

  const { data: player, error } = await supabaseAdmin
    .from('game_players')
    .update(updates)
    .eq('id', playerId)
    .select()
    .single();

  if (error) {
    return errorResponse(`Failed to update player: ${error.message}`, 500);
  }

  return NextResponse.json({ success: true, player });
}
