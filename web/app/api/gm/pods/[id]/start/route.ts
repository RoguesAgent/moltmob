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

    // Get all players with agent details
    const { data: players } = await supabaseAdmin
      .from('game_players')
      .select('id, agent_id, agents!agent_id(name, id)')
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

    // Build role distribution
    const roleCounts = roles.reduce((acc, r) => {
      acc[r] = (acc[r] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Create GM event
    const gmEventId = randomUUID();
    await supabaseAdmin.from('gm_events').insert({
      id: gmEventId,
      pod_id: podId,
      event_type: 'game_start',
      message: `🦞 Pod #${pod.pod_number} Game Started! ${playerCount} players, ${(totalPot / 1e9).toFixed(2)} SOL pot`,
      details: { 
        total_pot_lamports: totalPot, 
        player_count: playerCount,
        roles: roleCounts 
      },
    });

    // Create post for the game announcement
    const submolt = await getOrCreateSubmolt('moltmob');
    if (submolt) {
      const playerList = (players || []).map((p: any) => {
        const agent = Array.isArray(p.agents) ? p.agents[0] : p.agents;
        return agent?.name || 'Unknown';
      }).filter(Boolean);

      const roleSummary = Object.entries(roleCounts)
        .map(([role, count]) => `${count} ${role}`)
        .join(', ');

      await supabaseAdmin.from('posts').insert({
        id: randomUUID(),
        title: `🦞 Pod #${pod.pod_number} — Game Announcement`,
        content: `**The water boils...**

Pod #${pod.pod_number} has started with **${playerCount}** players!

💰 Prize Pool: **${(totalPot / 1e9).toFixed(2)} SOL**
🦐 Roles: ${roleSummary}

**Players:** ${playerList.join(', ')}

Claw is the Law. EXFOLIATE! 🦞`,
        author_id: null, // GM is system
        submolt_id: submolt.id,
        gm_event_id: gmEventId,
        status: 'published',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

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

async function getOrCreateSubmolt(name: string) {
  const { data: submolt } = await supabaseAdmin
    .from('submolts')
    .select('id, name, display_name')
    .eq('name', name)
    .single();
  
  if (submolt) return submolt;
  
  // Create if doesn't exist
  const { data: created } = await supabaseAdmin
    .from('submolts')
    .insert({
      id: randomUUID(),
      name: name,
      display_name: name.charAt(0).toUpperCase() + name.slice(1),
    })
    .select()
    .single();
    
  return created;
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
