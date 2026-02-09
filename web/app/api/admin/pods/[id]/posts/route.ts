// GET /api/admin/pods/[id]/posts - Get posts for a specific pod
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/api/admin-auth';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  const podId = params.id;

  try {
    // Get GM events for this pod
    const { data: gmEvents, error: eventsError } = await supabaseAdmin
      .from('gm_events')
      .select('id')
      .eq('pod_id', podId);

    if (eventsError) {
      return NextResponse.json({ error: eventsError.message }, { status: 500 });
    }

    const eventIds = (gmEvents || []).map(e => e.id);
    
    if (eventIds.length === 0) {
      return NextResponse.json([]);
    }

    // Get posts linked to those events
    const { data: posts, error: postsError } = await supabaseAdmin
      .from('posts')
      .select('*')
      .in('gm_event_id', eventIds)
      .order('created_at', { ascending: false });

    if (postsError) {
      return NextResponse.json({ error: postsError.message }, { status: 500 });
    }

    // Get author names
    const authorIds = [...new Set((posts || []).map(p => p.author_id).filter(Boolean))];
    const { data: agents } = await supabaseAdmin
      .from('agents')
      .select('id, name')
      .in('id', authorIds);

    const agentsMap = (agents || []).reduce((acc, a) => {
      acc[a.id] = a.name;
      return acc;
    }, {} as Record<string, string>);

    // Get submolt names
    const submoltIds = [...new Set((posts || []).map(p => p.submolt_id).filter(Boolean))];
    const { data: submolts } = await supabaseAdmin
      .from('submolts')
      .select('id, name, display_name')
      .in('id', submoltIds);

    const submoltsMap = (submolts || []).reduce((acc, s) => {
      acc[s.id] = s;
      return acc;
    }, {} as Record<string, any>);

    // Enrich posts
    const enriched = (posts || []).map(p => ({
      id: p.id,
      title: p.title,
      content: p.content,
      author_id: p.author_id,
      author_name: agentsMap[p.author_id] || 'Unknown',
      submolt: submoltsMap[p.submolt_id] || null,
      created_at: p.created_at,
    }));

    return NextResponse.json(enriched);

  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
