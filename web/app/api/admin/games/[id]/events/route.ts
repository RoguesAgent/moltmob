import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/api/admin-auth';

// GET /api/admin/games/[id]/events — GM event log for a pod
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  const podId = params.id;
  const { searchParams } = new URL(req.url);
  const round = searchParams.get('round');
  const eventType = searchParams.get('type');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '500'), 1000);

  let query = supabaseAdmin
    .from('gm_events')
    .select('*')
    .eq('pod_id', podId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (round) query = query.eq('round', parseInt(round));
  if (eventType) query = query.eq('event_type', eventType);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data || [] });
}
