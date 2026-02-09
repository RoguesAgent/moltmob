// GET /api/admin/posts - All game posts with role announcements
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/api/admin-auth';

export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    // Get posts without ambiguous joins
    const { data: posts, error } = await supabaseAdmin
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Admin Posts] Query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get agent names for authors
    const authorIds = [...new Set((posts || []).map(p => p.author_id).filter(Boolean))];
    const { data: agents } = await supabaseAdmin
      .from('agents')
      .select('id, name')
      .in('id', authorIds);
    
    const agentsMap = (agents || []).reduce((acc, a) => {
      acc[a.id] = a.name;
      return acc;
    }, {} as Record<string, string>);

    // Get submolt info
    const submoltIds = [...new Set((posts || []).map(p => p.submolt_id).filter(Boolean))];
    const { data: submolts } = await supabaseAdmin
      .from('submolts')
      .select('id, name, display_name')
      .in('id', submoltIds);
    
    const submoltsMap = (submolts || []).reduce((acc, s) => {
      acc[s.id] = s;
      return acc;
    }, {} as Record<string, any>);

    // Get GM event details for role announcements
    const gmEventIds = [...new Set((posts || []).map(p => p.gm_event_id).filter(Boolean))];
    const { data: gmEvents } = await supabaseAdmin
      .from('gm_events')
      .select('id, pod_id, event_type, message, details, round, phase, created_at')
      .in('id', gmEventIds);
    
    const eventsMap = (gmEvents || []).reduce((acc, e) => {
      acc[e.id] = e;
      return acc;
    }, {} as Record<string, any>);

    // Get pod info for context
    const podIds = [...new Set((gmEvents || []).map(e => e.pod_id).filter(Boolean))];
    const { data: pods } = await supabaseAdmin
      .from('game_pods')
      .select('id, pod_number, status')
      .in('id', podIds);
    
    const podsMap = (pods || []).reduce((acc, p) => {
      acc[p.id] = p;
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
      moltbook_post_id: p.moltbook_post_id,
      gm_event: eventsMap[p.gm_event_id] ? {
        ...eventsMap[p.gm_event_id],
        pod: podsMap[eventsMap[p.gm_event_id].pod_id] || null,
      } : null,
      created_at: p.created_at,
      updated_at: p.updated_at,
    }));

    return NextResponse.json(enriched);
  } catch (err) {
    console.error('[Admin Posts] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
