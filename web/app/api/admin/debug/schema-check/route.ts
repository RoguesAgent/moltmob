// DEBUG: Check actual schema of posts and gm_events tables
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/api/admin-auth';

export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    // Try to get one post to see structure
    const { data: post, error: postError } = await supabaseAdmin
      .from('posts')
      .select('*')
      .limit(1)
      .maybeSingle();

    // Try to get one gm_event
    const { data: gmEvent, error: gmEventError } = await supabaseAdmin
      .from('gm_events')
      .select('*')
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      posts: {
        exists: !!post || postError?.code !== 'PGRST116',
        columns: post ? Object.keys(post) : null,
        error: postError?.message,
        sample: post,
      },
      gm_events: {
        exists: !!gmEvent || gmEventError?.code !== 'PGRST116',
        columns: gmEvent ? Object.keys(gmEvent) : null,
        error: gmEventError?.message,
        sample: gmEvent,
      },
    });

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
