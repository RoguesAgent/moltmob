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

    // Assign roles
    const roles = generateRoles(playerCount);
    for (let i = 0; i < players.length; i++) {
      await supabaseAdmin
        .from('game_players')
        .update({ role: roles[i] })
        .eq('id', players[i].id);
    }

    // Transition to active
    const { data: updated } = await supabaseAdmin
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

    // Log event
    await supabaseAdmin.from('gm_events').insert({
      id: randomUUID(),
      pod_id: podId,
      event_type: 'game_start',
      message: `Game started with ${playerCount} players`,
      details: { roles_assigned: roles },
    });

    return NextResponse.json({
      success: true,
      pod: updated,
      players: playerCount,
      roles: roles,
    });

  } catch (err) {
    console.error('[GM Start] Error:', err);
    return NextResponse.json({ error: 'Failed to start game' }, { status: 500 });
  }
}

function generateRoles(count: number): string[] {
  // 1 Clawboss, 2 Krill, rest Loyalists
  const roles: string[] = [];
  roles.push('clawboss');
  roles.push('krill');
  if (count > 6) roles.push('krill');
  while (roles.length < count) {
    roles.push('loyalist');
  }
  // Shuffle
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  return roles;
}
