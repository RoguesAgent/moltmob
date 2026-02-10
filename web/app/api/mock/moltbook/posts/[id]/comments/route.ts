// Mock Moltbook API - Comments Endpoint
// Mirrors real Moltbook API but stores in local Supabase
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { randomUUID } from 'crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getAgentFromKey(apiKey: string) {
  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('id, name, api_key')
    .eq('api_key', apiKey)
    .single();
  return agent;
}

// GET /api/mock/moltbook/posts/:id/comments
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authHeader = req.headers.get('authorization');
  const apiKey = authHeader?.replace('Bearer ', '');
  
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'API key required', code: 401 }, { status: 401 });
  }

  const agent = await getAgentFromKey(apiKey);
  if (!agent) {
    return NextResponse.json({ success: false, error: 'Invalid API key', code: 401 }, { status: 401 });
  }

  const { id } = params;
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ success: false, error: 'Invalid post ID format', code: 400 }, { status: 400 });
  }

  // Verify post exists
  const { data: post } = await supabaseAdmin
    .from('posts')
    .select('id')
    .eq('id', id)
    .single();

  if (!post) {
    return NextResponse.json({ success: false, error: 'Post not found', code: 404 }, { status: 404 });
  }

  const { data: comments, error, count } = await supabaseAdmin
    .from('comments')
    .select('*, author:agents!author_id(id, name)', { count: 'exact' })
    .eq('post_id', id)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[Mock Moltbook] Error fetching comments:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch comments', code: 500 }, { status: 500 });
  }

  const transformed = (comments || []).map((c: any) => {
    const author = Array.isArray(c.author) ? c.author[0] : c.author;
    return {
      id: c.id,
      content: c.content,
      upvotes: c.upvotes || 0,
      downvotes: c.downvotes || 0,
      created_at: c.created_at,
      author: { id: author?.id || '', name: author?.name || 'Unknown' },
      post_id: c.post_id,
    };
  });

  return NextResponse.json({
    success: true,
    comments: transformed,
    count: count || 0,
  });
}

// POST /api/mock/moltbook/posts/:id/comments
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authHeader = req.headers.get('authorization');
  const apiKey = authHeader?.replace('Bearer ', '');
  
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'API key required', code: 401 }, { status: 401 });
  }

  const agent = await getAgentFromKey(apiKey);
  if (!agent) {
    return NextResponse.json({ success: false, error: 'Invalid API key', code: 401 }, { status: 401 });
  }

  const { id } = params;
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ success: false, error: 'Invalid post ID format', code: 400 }, { status: 400 });
  }

  try {
    const body = await req.json();

    if (!body.content?.trim()) {
      return NextResponse.json({ success: false, error: 'Content is required', code: 400 }, { status: 400 });
    }

    const content = body.content.trim();
    if (content.length > 5000) {
      return NextResponse.json({ success: false, error: 'Content too long (max 5000 chars)', code: 400 }, { status: 400 });
    }

    // Verify post exists and get current comment count
    const { data: post } = await supabaseAdmin
      .from('posts')
      .select('id, comment_count')
      .eq('id', id)
      .single();

    if (!post) {
      return NextResponse.json({ success: false, error: 'Post not found', code: 404 }, { status: 404 });
    }

    // Create comment
    const commentId = randomUUID();
    const { data: comment, error } = await supabaseAdmin
      .from('comments')
      .insert({
        id: commentId,
        content,
        author_id: agent.id,
        post_id: id,
        upvotes: 0,
        downvotes: 0,
      })
      .select('*, author:agents!author_id(id, name)')
      .single();

    if (error) {
      console.error('[Mock Moltbook] Error creating comment:', error);
      return NextResponse.json({ success: false, error: 'Failed to create comment', code: 500 }, { status: 500 });
    }

    // Increment comment_count on post
    await supabaseAdmin
      .from('posts')
      .update({ comment_count: (post.comment_count || 0) + 1 })
      .eq('id', id);

    const author = Array.isArray(comment.author) ? comment.author[0] : comment.author;

    return NextResponse.json({
      success: true,
      comment: {
        id: comment.id,
        content: comment.content,
        upvotes: 0,
        downvotes: 0,
        created_at: comment.created_at,
        author: { id: author?.id || '', name: author?.name || 'Unknown' },
        post_id: comment.post_id,
      },
    }, { status: 201 });

  } catch (err) {
    console.error('[Mock Moltbook] Error:', err);
    return NextResponse.json({ success: false, error: 'Invalid request body', code: 400 }, { status: 400 });
  }
}
