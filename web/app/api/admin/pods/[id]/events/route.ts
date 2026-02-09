// GET /api/admin/pods/[id]/events
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminAuth } from '@/lib/api/admin-auth';

export const runtime = 'nodejs';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not set');
  return createClient(url, key);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  const { id: podId } = await params;
  const supabaseAdmin = getSupabase();

  try {
    const { data: events, error } = await supabaseAdmin
      .from('gm_events')
      .select('*')
      .eq('pod_id', podId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const mapped = (events || []).map((e) => ({
      id: e.id,
      type: e.event_type,
      message: e.message,
      timestamp: e.created_at,
      details: e.details,
    }));

    return NextResponse.json(mapped);
  } catch (err) {
    console.error('[Admin Events] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}
