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
    const { data: players, count } = await supabaseAdmin
      .from('game_players')
      .select('id', { count: 'exact' })
      .eq('pod_id', podId);

    const playerCount = count || 0;
    if (playerCount < 6) {
      return NextResponse.json({ 
        error: 'Need at least 6 players', 
        current: playerCount 
      }, { status: 400 });
    }

    // Calculate total pot: entry_fee * playerCount
    const totalPot = pod.entry_fee * playerCount;

    // Transition to active (only use columns that actually exist!)
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('game_pods')
      .update({
        status: 'active',
        current_phase: 'night',
        current_round: 1,
        total_pot: totalPot,
        updated_at: new Date().toISOString(),
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
      details: { total_pot_lamports: totalPot, player_count: playerCount },
    });

    return NextResponse.json({
      success: true,
      pod: updated,
      players: playerCount,
      total_pot_sol: totalPot / 1e9,
    });

  } catch (err) {
    console.error('[GM Start] Error:', err);
    return NextResponse.json({ error: 'Failed to start game' }, { status: 500 });
  }
}
