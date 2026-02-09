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
    // Get pod
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

    // Get all players
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

    // Generate and assign roles
    const roles = generateRoles(playerCount);
    for (let i = 0; i < players.length; i++) {
      const { error: roleError } = await supabaseAdmin
        .from('game_players')
        .update({ role: roles[i] })
        .eq('id', players[i].id);
      
      if (roleError) {
        console.error(`[GM Start] Failed to assign role to ${players[i].id}:`, roleError);
      }
    }

    // Calculate total pot
    const totalPot = pod.entry_fee * playerCount;

    // Transition to active
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

    // Log event with role distribution
    const roleCounts = roles.reduce((acc, r) => {
      acc[r] = (acc[r] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    await supabaseAdmin.from('gm_events').insert({
      id: randomUUID(),
      pod_id: podId,
      event_type: 'game_start',
      message: `Game started with ${playerCount} players`,
      details: { 
        total_pot_lamports: totalPot, 
        player_count: playerCount,
        roles: roleCounts 
      },
    });

    return NextResponse.json({
      success: true,
      pod: updated,
      players: playerCount,
      roles_assigned: roleCounts,
      total_pot_sol: totalPot / 1e9,
    });

  } catch (err) {
    console.error('[GM Start] Error:', err);
    return NextResponse.json({ error: 'Failed to start game' }, { status: 500 });
  }
}

function generateRoles(count: number): string[] {
  // Role distribution: 1 Clawboss, 2 Krill, rest Loyalists
  const roles: string[] = [];
  
  // Always 1 Clawboss
  roles.push('clawboss');
  
  // 2 Krill for 6+ players
  roles.push('krill');
  roles.push('krill');
  
  // Fill rest with Loyalists
  while (roles.length < count) {
    roles.push('loyalist');
  }
  
  // Shuffle the roles
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  
  return roles;
}
