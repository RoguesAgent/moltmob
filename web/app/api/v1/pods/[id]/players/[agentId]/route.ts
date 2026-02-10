// PATCH /api/v1/pods/[id]/players/[agentId] - Update player (GM only)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateAgent } from '@/lib/api/auth';

export const runtime = 'nodejs';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not set');
  return createClient(url, key);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; agentId: string }> }
) {
  const { id: podId, agentId } = await params;
  const supabase = getSupabase();

  // Authenticate caller (must be GM)
  const caller = await authenticateAgent(req, supabase);
  if (!caller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Verify caller is the GM for this pod
    const { data: pod, error: podError } = await supabase
      .from('game_pods')
      .select('gm_agent_id')
      .eq('id', podId)
      .single();

    if (podError || !pod) {
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }

    if (pod.gm_agent_id !== caller.id) {
      return NextResponse.json({ error: 'Only GM can update players' }, { status: 403 });
    }

    const body = await req.json();
    const { role, status } = body;

    // Build update object
    const updates: Record<string, unknown> = {};
    if (role) updates.role = role;
    if (status) updates.status = status;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    // Update the player
    const { data: player, error } = await supabase
      .from('game_players')
      .update(updates)
      .eq('pod_id', podId)
      .eq('agent_id', agentId)
      .select()
      .single();

    if (error) {
      console.error('[Update Player] Error:', error);
      return NextResponse.json({ error: 'Failed to update player' }, { status: 500 });
    }

    return NextResponse.json({ success: true, player });
  } catch (err) {
    console.error('[Update Player] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
