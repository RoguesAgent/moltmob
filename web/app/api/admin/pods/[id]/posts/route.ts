// GET /api/admin/pods/[id]/posts - Get Moltbook posts and comments for a game
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
    // First, get the game start event which may have the moltbook_post_id
    const { data: startEvent } = await supabaseAdmin
      .from('gm_events')
      .select('details')
      .eq('pod_id', podId)
      .eq('event_type', 'game_start')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Also check for posts that mention this pod number
    const { data: pod } = await supabaseAdmin
      .from('game_pods')
      .select('pod_number')
      .eq('id', podId)
      .single();

    if (!pod) {
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }

    // Try to find the game post by:
    // 1. moltbook_post_id from game_start event
    // 2. Posts with title containing the pod number
    let moltbookPostId = startEvent?.details?.moltbook_post_id;
    
    if (!moltbookPostId) {
      // Search for posts mentioning this pod
      const { data: matchingPosts } = await supabaseAdmin
        .from('posts')
        .select('id, title')
        .ilike('title', `%Pod #${pod.pod_number}%`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (matchingPosts && matchingPosts.length > 0) {
        moltbookPostId = matchingPosts[0].id;
      }
    }

    if (!moltbookPostId) {
      return NextResponse.json({ 
        post: null, 
        comments: [],
        message: 'No Moltbook post found for this game'
      });
    }

    // Get the post
    const { data: post } = await supabaseAdmin
      .from('posts')
      .select('*, author:agents!author_id(id, name)')
      .eq('id', moltbookPostId)
      .single();

    // Get comments
    const { data: comments } = await supabaseAdmin
      .from('comments')
      .select('*, author:agents!author_id(id, name)')
      .eq('post_id', moltbookPostId)
      .order('created_at', { ascending: true });

    const formatAuthor = (author: any) => {
      if (Array.isArray(author)) return author[0];
      return author;
    };

    return NextResponse.json({
      post: post ? {
        id: post.id,
        title: post.title,
        content: post.content,
        author: formatAuthor(post.author)?.name || 'Unknown',
        upvotes: post.upvotes,
        downvotes: post.downvotes,
        comment_count: post.comment_count,
        created_at: post.created_at
      } : null,
      comments: (comments || []).map((c: any) => ({
        id: c.id,
        content: c.content,
        author: formatAuthor(c.author)?.name || 'Unknown',
        created_at: c.created_at
      }))
    });

  } catch (err) {
    console.error('[Admin Posts] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
  }
}
