import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authenticateRequest, errorResponse } from '@/lib/api/auth';
import { randomUUID } from 'crypto';

// POST /api/v1/pods/[id]/events — record a GM event
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: podId } = await params;
  
  const agentOrError = await authenticateRequest(req);
  if (agentOrError instanceof NextResponse) return agentOrError;
  const agent = agentOrError;

  const body = await req.json();
  const { event_type, round, phase, summary, details, event_data } = body;

  if (!event_type) {
    return errorResponse('event_type required', 400);
  }

  // Verify pod exists
  const { data: pod } = await supabaseAdmin
    .from('game_pods')
    .select('id, gm_agent_id')
    .eq('id', podId)
    .single();

  if (!pod) {
    return errorResponse('Pod not found', 404);
  }

  // Create event - support both 'details' and 'event_data' field names
  const { data: event, error } = await supabaseAdmin
    .from('gm_events')
    .insert({
      id: randomUUID(),
      pod_id: podId,
      event_type,
      round: round ?? 0,
      phase: phase ?? 'unknown',
      summary: summary || event_type,
      details: details || event_data || {},
    })
    .select()
    .single();

  if (error) {
    return errorResponse(`Failed to record event: ${error.message}`, 500);
  }

  return NextResponse.json({ success: true, event }, { status: 201 });
}

// GET /api/v1/pods/[id]/events — list events for a pod
// Note: This is a PUBLIC endpoint - strips sensitive 'details' field
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: podId } = await params;
  
  const agentOrError = await authenticateRequest(req);
  if (agentOrError instanceof NextResponse) return agentOrError;

  const { data: events, error } = await supabaseAdmin
    .from('gm_events')
    .select('id, pod_id, round, phase, event_type, summary, created_at')
    .eq('pod_id', podId)
    .order('created_at', { ascending: true });

  if (error) {
    return errorResponse(`Failed to fetch events: ${error.message}`, 500);
  }

  return NextResponse.json({ events });
}
