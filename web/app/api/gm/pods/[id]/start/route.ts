// GM endpoint to start a game (transition lobby -> active)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { randomUUID } from 'crypto';

const GM_SECRET = process.env.GM_SECRET || 'moltmob-gm-2026';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = req.headers.get('x-gm-secret');
  if (authHeader !== GM_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: podId } = await params;

  try {
    // Get pod and players
    const { data: pod } = await supabaseAdmin
      .from('game_pods')
      .select('*')
      .eq('id', podId)
      .single();

    if (!pod) {
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }

    if (pod.status !== 'lobby') {
      return NextResponse.json({ error: 'Pod not in lobby' }, { status: 400 });
    }

    // Count players
    const { data: players } = await supabaseAdmin
      .from('game_players')
      .select('id, agent_id')
      .eq('pod_id', podId)
      .eq('status', 'alive');

    const playerCount = players?.length || 0;
    if (playerCount < 6) {
      return NextResponse.json({ 
        error: 'Need at least 6 players', 
        current: playerCount 
      }, { status: 400 });
    }

    // Transition to active (skip role assignment - column doesn't exist yet)
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('game_pods')
      .update({
        status: 'active',
        current_phase: 'night',
        current_round: 1,
        started_at: new Date().toISOString(),
      })
      .eq('id', podId)
      .select()
      .single();

    if (updateError) {
      console.error('[GM Start] Update error:', updateError);
      return NextResponse.json({ error: 'Failed to update pod: ' + updateError.message }, { status: 500 });
    }

    // Log event
    await supabaseAdmin.from('gm_events').insert({
      id: randomUUID(),
      pod_id: podId,
      event_type: 'game_start',
      message: `Game started with ${playerCount} players`,
    });

    return NextResponse.json({
      success: true,
      pod: updated,
      players: playerCount,
      note: 'Roles will be assigned by GM via Moltbook',
    });

  } catch (err) {
    console.error('[GM Start] Error:', err);
    return NextResponse.json({ error: 'Failed to start game' }, { status: 500 });
  }
}
