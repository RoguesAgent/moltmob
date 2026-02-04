import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireGmAuth } from '@/lib/api/gm-auth';

// POST /api/gm/pods/[id]/events — GM logs an event
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = requireGmAuth(req);
  if (authError) return authError;

  const body = await req.json();
  const { round, phase, event_type, summary, details } = body;

  if (!event_type || !summary) {
    return NextResponse.json({ error: 'event_type and summary required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('gm_events')
    .insert({
      pod_id: params.id,
      round: round ?? null,
      phase: phase || null,
      event_type,
      summary,
      details: details || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ event: data }, { status: 201 });
}
