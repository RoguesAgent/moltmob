// Mock Moltbook API - Posts Endpoint
// Mirrors real Moltbook API but stores in local Supabase
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { randomUUID } from 'crypto';

// Simple auth check for mock API
async function getAgentFromKey(apiKey: string) {
  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('id, name, api_key')
    .eq('api_key', apiKey)
    .single();
  return agent;
}

// GET /api/mock/moltbook/posts?sort=hot|new&limit=N&offset=N&submolt=name
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const apiKey = authHeader?.replace('Bearer ', '');
  
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'API key required', code: 401 }, { status: 401 });
  }

  const agent = await getAgentFromKey(apiKey);
  if (!agent) {
    return NextResponse.json({ success: false, error: 'Invalid API key', code: 401 }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sort = searchParams.get('sort') || 'hot';
  const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const submolt = searchParams.get('submolt') || 'general';

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
  } else {
    // hot sort - we'll re-sort in memory
    query = query.order('created_at', { ascending: false });
  }

  query = query.range(offset, offset + limit - 1);
  const { data: posts, error, count } = await query;

  if (error) {
    console.error('[Mock Moltbook] Error fetching posts:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch posts', code: 500 }, { status: 500 });
  }

  // Transform to Moltbook format
  let transformed = (posts || []).map((p: any) => {
    const author = Array.isArray(p.author) ? p.author[0] : p.author;
    const submolt = Array.isArray(p.submolt) ? p.submolt[0] : p.submolt;
    return {
      id: p.id,
      title: p.title,
      content: p.content || '',
      url: p.url || null,
      upvotes: p.upvotes || 0,
      downvotes: p.downvotes || 0,
      comment_count: p.comment_count || 0,
      created_at: p.created_at,
      author: { id: author?.id || '', name: author?.name || 'Unknown' },
      submolt: { id: submolt?.id || '', name: submolt?.name || 'general', display_name: submolt?.display_name || 'General' },
    };
  });

  // Apply hot sort in memory
  if (sort === 'hot') {
    transformed.sort((a, b) => {
      const scoreA = a.upvotes - a.downvotes + a.comment_count;
      const scoreB = b.upvotes - b.downvotes + b.comment_count;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  return NextResponse.json({
    success: true,
    posts: transformed,
    count: count || 0,
    has_more: (offset + limit) < (count || 0),
    next_offset: offset + limit,
  });
}

// POST /api/mock/moltbook/posts
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const apiKey = authHeader?.replace('Bearer ', '');
  
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'API key required', code: 401 }, { status: 401 });
  }

  const agent = await getAgentFromKey(apiKey);
  if (!agent) {
    return NextResponse.json({ success: false, error: 'Invalid API key', code: 401 }, { status: 401 });
  }

  try {
    const body = await req.json();
    
    if (!body.title?.trim()) {
      return NextResponse.json({ success: false, error: 'Title is required', code: 400 }, { status: 400 });
    }

    // Get submolt
    const submoltName = body.submolt_id || 'general';
    const { data: submolt } = await supabaseAdmin
      .from('submolts')
      .select('id, name, display_name')
      .eq('name', submoltName)
      .single();

    if (!submolt) {
      return NextResponse.json({ success: false, error: `Submolt "${submoltName}" not found`, code: 404 }, { status: 404 });
    }

    const postId = randomUUID();
    const { data: post, error } = await supabaseAdmin
      .from('posts')
      .insert({
        id: postId,
        title: body.title.trim(),
        content: body.content?.trim() || '',
        author_id: agent.id,
        submolt_id: submolt.id,
        upvotes: 0,
        downvotes: 0,
        comment_count: 0,
      })
      .select('*, author:agents!author_id(id, name), submolt:submolts!submolt_id(id, name, display_name)')
      .single();

    if (error) {
      console.error('[Mock Moltbook] Error creating post:', error);
      return NextResponse.json({ success: false, error: 'Failed to create post', code: 500 }, { status: 500 });
    }

    const author = Array.isArray(post.author) ? post.author[0] : post.author;
    const postSubmolt = Array.isArray(post.submolt) ? post.submolt[0] : post.submolt;

    return NextResponse.json({
      success: true,
      post: {
        id: post.id,
        title: post.title,
        content: post.content || '',
        url: post.url || null,
        upvotes: post.upvotes || 0,
        downvotes: post.downvotes || 0,
        comment_count: post.comment_count || 0,
        created_at: post.created_at,
        author: { id: author?.id || '', name: author?.name || 'Unknown' },
        submolt: { id: postSubmolt?.id || '', name: postSubmolt?.name || 'general', display_name: postSubmolt?.display_name || 'General' },
      },
    }, { status: 201 });

  } catch (err) {
    console.error('[Mock Moltbook] Error:', err);
    return NextResponse.json({ success: false, error: 'Invalid request body', code: 400 }, { status: 400 });
  }
}
// Trigger redeploy 20260210102903
