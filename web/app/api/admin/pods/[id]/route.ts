import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminAuth } from '@/lib/api/admin-auth';

// Use Node.js runtime instead of Edge to access process.env
export const runtime = 'nodejs';

// Create Supabase client inside function for Edge runtime compatibility
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not set');
  return createClient(url, key);
}

// GET /api/admin/pods/[id] — full pod details with players and events
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  // Await params for Edge Runtime compatibility
  const { id: podId } = await params;
  console.log('[Admin Pod API] Fetching pod:', podId);

  const supabaseAdmin = getSupabase();

  try {
    // Get pod
    console.log('[Admin Pod API] Query 1: Fetching pod...');
    const { data: pod, error: podError } = await supabaseAdmin
      .from('game_pods')
      .select('*')
      .eq('id', podId)
      .single();

    if (podError) {
      console.error('[Admin Pod API] Pod query error:', podError);
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }

    if (!pod) {
      console.error('[Admin Pod API] Pod not found for id:', podId);
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }
    console.log('[Admin Pod API] Pod found:', pod.id);

    // Get players (without join - simpler query)
    console.log('[Admin Pod API] Query 2: Fetching players...');
    const { data: players, error: playersError } = await supabaseAdmin
      .from('game_players')
      .select('*')
      .eq('pod_id', podId);

    if (playersError) {
      console.error('[Admin Pod API] Players query error:', playersError);
      throw new Error(`Players query failed: ${playersError.message}`);
    }
    console.log('[Admin Pod API] Players found:', players?.length || 0);

    // Get agent details separately for each player
    const agentIds = players?.map(p => p.agent_id).filter(Boolean) || [];
    let agentsMap: Record<string, { id: string; name: string; wallet_pubkey: string }> = {};

    if (agentIds.length > 0) {
      console.log('[Admin Pod API] Query 2b: Fetching agents...');
      const { data: agents, error: agentsError } = await supabaseAdmin
        .from('agents')
        .select('id, name, wallet_pubkey')
        .in('id', agentIds);

      if (agentsError) {
        console.error('[Admin Pod API] Agents query error:', agentsError);
        throw new Error(`Agents query failed: ${agentsError.message}`);
      }

      agentsMap = (agents || []).reduce((acc, agent) => {
        acc[agent.id] = agent;
        return acc;
      }, {} as Record<string, { id: string; name: string; wallet_pubkey: string }>);
      console.log('[Admin Pod API] Agents found:', Object.keys(agentsMap).length);
    }

    // Get events sorted by time
    console.log('[Admin Pod API] Query 3: Fetching events...');
    const { data: events, error: eventsError } = await supabaseAdmin
      .from('gm_events')
      .select('*')
      .eq('pod_id', podId)
      .order('created_at', { ascending: true });

    if (eventsError) {
      console.error('[Admin Pod API] Events query error:', eventsError);
      throw new Error(`Events query failed: ${eventsError.message}`);
    }
    console.log('[Admin Pod API] Events found:', events?.length || 0);

    // Get transactions
    console.log('[Admin Pod API] Query 4: Fetching transactions...');
    const { data: transactions, error: txError } = await supabaseAdmin
      .from('game_transactions')
      .select('*')
      .eq('pod_id', podId)
      .order('created_at', { ascending: true });

    if (txError) {
      console.error('[Admin Pod API] Transactions query error:', txError);
      throw new Error(`Transactions query failed: ${txError.message}`);
    }
    console.log('[Admin Pod API] Transactions found:', transactions?.length || 0);

    // Get Moltbook post if any
    console.log('[Admin Pod API] Query 5: Fetching moltbook post...');
    const { data: moltbookPosts, error: moltbookError } = await supabaseAdmin
      .from('gm_events')
      .select('details')
      .eq('pod_id', podId)
      .eq('event_type', 'game_start')
      .order('created_at', { ascending: false })
      .limit(1);

    if (moltbookError) {
      console.error('[Admin Pod API] Moltbook post query error:', moltbookError);
      // Non-fatal - continue with null moltbookPostId
    }

    const moltbookPostId = moltbookPosts?.[0]?.details?.moltbook_post_id;
    console.log('[Admin Pod API] Moltbook post id:', moltbookPostId);

    console.log('[Admin Pod API] All queries successful, returning response');

    return NextResponse.json({
      pod: {
        id: pod.id,
        status: pod.status,
        phase: pod.current_phase,
        round: pod.current_round,
        playerCount: pod.player_count,
        prizePool: pod.total_pot / 1e9,
        boilMeter: pod.boil_meter,
        entry_fee_sol: pod.entry_fee / 1e9,
      },
      players: (players || []).map((p) => {
        const agent = agentsMap[p.agent_id];
        return {
          id: p.id,
          agent_id: p.agent_id,
          agent_name: agent?.name || 'Unknown',
          wallet_pubkey: agent?.wallet_pubkey,
          role: p.role,
          status: p.status,
          eliminated_by: p.eliminated_by,
          eliminated_round: p.eliminated_round,
          joined_at: p.joined_at,
        };
      }),
      events: events || [],
      transactions: (transactions || []).map((t) => ({
        ...t,
        amount_sol: t.amount / 1e9,
      })),
      moltbook: {
        post_id: moltbookPostId,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Admin pod detail error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch pod details', details: errorMsg },
      { status: 500 }
    );
  }
}
