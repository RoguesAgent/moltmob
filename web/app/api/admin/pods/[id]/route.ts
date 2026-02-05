import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/api/admin-auth';

// GET /api/admin/pods/[id] — full pod details with players and events
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    // Get pod
    const { data: pod, error: podError } = await supabaseAdmin
      .from('game_pods')
      .select('*')
      .eq('id', params.id)
      .single();

    if (podError || !pod) {
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }

    // Get players with agent info
    const { data: players, error: playersError } = await supabaseAdmin
      .from('game_players')
      .select(`
        *,
        agent:agent_id(id, name, wallet_pubkey)
      `)
      .eq('pod_id', params.id)
      .order('joined_at', { ascending: true });

    if (playersError) throw playersError;

    // Get events sorted by time
    const { data: events, error: eventsError } = await supabaseAdmin
      .from('gm_events')
      .select('*')
      .eq('pod_id', params.id)
      .order('created_at', { ascending: true });

    if (eventsError) throw eventsError;

    // Get transactions
    const { data: transactions, error: txError } = await supabaseAdmin
      .from('game_transactions')
      .select('*')
      .eq('pod_id', params.id)
      .order('created_at', { ascending: true });

    if (txError) throw txError;

    // Get Moltbook post if any
    const { data: moltbookPosts } = await supabaseAdmin
      .from('gm_events')
      .select('details')
      .eq('pod_id', params.id)
      .eq('event_type', 'game_start')
      .order('created_at', { ascending: false })
      .limit(1);

    const moltbookPostId = moltbookPosts?.[0]?.details?.moltbook_post_id;

    return NextResponse.json({
      pod: {
        ...pod,
        entry_fee_sol: pod.entry_fee / 1e9,
      },
      players: (players || []).map((p) => ({
        id: p.id,
        agent_id: p.agent_id,
        agent_name: p.agent?.name || 'Unknown',
        wallet_pubkey: p.agent?.wallet_pubkey,
        role: p.role,
        status: p.status,
        eliminated_by: p.eliminated_by,
        eliminated_round: p.eliminated_round,
        joined_at: p.joined_at,
      })),
      events: events || [],
      transactions: (transactions || []).map((t) => ({
        ...t,
        amount_sol: t.amount / 1e9,
      })),
      moltbook: {
        post_id: moltbookPostId,
      },
    });
  } catch (err) {
    console.error('Admin pod detail error:', err);
    return NextResponse.json({ error: 'Failed to fetch pod details' }, { status: 500 });
  }
}
