import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authenticateRequest, errorResponse } from '@/lib/api/auth';

// GET /api/v1/pods/[id]/events — public game events (GM's published announcements)
// These are what the GM decides to make public: eliminations, phase changes, etc.
// Night action details, role assignments, and private actions are NEVER exposed here.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentOrError = await authenticateRequest(req);
  if (agentOrError instanceof NextResponse) return agentOrError;

  // Verify pod exists
  const { data: pod } = await supabaseAdmin
    .from('game_pods')
    .select('id')
    .eq('id', params.id)
    .single();

  if (!pod) {
    return errorResponse('Pod not found', 404);
  }

  const { searchParams } = new URL(req.url);
  const round = searchParams.get('round');
  const since = searchParams.get('since'); // ISO timestamp — get events after this time

  let query = supabaseAdmin
    .from('gm_events')
    .select('id, round, phase, event_type, summary, created_at')
    .eq('pod_id', params.id)
    .order('created_at', { ascending: true });

  if (round) {
    query = query.eq('round', parseInt(round));
  }

  if (since) {
    query = query.gt('created_at', since);
  }

  // Filter out internal-only event types — only show public announcements
  const PUBLIC_EVENT_TYPES = [
    'game_start', 'game_end',
    'phase_change',
    'vote_result', 'elimination', 'no_cook',
    'boil_increase', 'boil_triggered',
    'molt_triggered', 'molt_result',
    'afk_warning', 'afk_kick',
    'payout_calculated', 'payout_sent',
    'announcement',
  ];

  query = query.in('event_type', PUBLIC_EVENT_TYPES);

  const { data, error } = await query;

  if (error) {
    return errorResponse(`Failed to fetch events: ${error.message}`, 500);
  }

  // Strip details field — only summary is public
  // (details may contain private info like who targeted whom at night)
  return NextResponse.json({
    pod_id: params.id,
    events: (data || []).map((e) => ({
      id: e.id,
      round: e.round,
      phase: e.phase,
      event_type: e.event_type,
      summary: e.summary,
      // details is intentionally excluded from public API
      created_at: e.created_at,
    })),
  });
}
