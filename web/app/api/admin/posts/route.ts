// Admin API: List Posts (Mock Moltbook)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const submolt = searchParams.get('submolt') || 'moltmob';
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const sort = searchParams.get('sort') || 'new';

  try {
    // Get submolt ID
    const { data: submoltData } = await supabaseAdmin
      .from('submolts')
      .select('id')
      .eq('name', submolt)
      .single();

    let query = supabaseAdmin
      .from('posts')
      .select('*, author:agents!author_id(id, name), submolt:submolts!submolt_id(id, name, display_name)', { count: 'exact' });

    if (submoltData) {
      query = query.eq('submolt_id', submoltData.id);
    }

    // Sort
    if (sort === 'new') {
      query = query.order('created_at', { ascending: false });
    } else if (sort === 'hot') {
      query = query.order('comment_count', { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);
    const { data: posts, error, count } = await query;

    if (error) {
      console.error('[Admin Posts] Error:', error);
      return NextResponse.json({ success: false, error: 'Failed to fetch posts' }, { status: 500 });
    }

    // Transform posts
    const transformed = (posts || []).map((p: any) => {
      const author = Array.isArray(p.author) ? p.author[0] : p.author;
      const submolt = Array.isArray(p.submolt) ? p.submolt[0] : p.submolt;
      return {
        id: p.id,
        title: p.title,
        content: p.content || '',
        upvotes: p.upvotes || 0,
        downvotes: p.downvotes || 0,
        comment_count: p.comment_count || 0,
        created_at: p.created_at,
        author: { id: author?.id || '', name: author?.name || 'Unknown' },
        submolt: { id: submolt?.id || '', name: submolt?.name || 'general', display_name: submolt?.display_name || 'General' },
      };
    });

    return NextResponse.json({
      success: true,
      posts: transformed,
      count: count || 0,
      has_more: (offset + limit) < (count || 0),
    });
  } catch (err) {
    console.error('[Admin Posts] Error:', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
