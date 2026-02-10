// Mock Moltbook API - Comments Endpoint
// Mirrors real Moltbook API but stores in local Supabase
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { randomUUID } from 'crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Auth check for mock API - supports both API key and MOCK_API_SECRET
async function getAgentFromAuth(req: NextRequest, authorName?: string): Promise<{ id: string; name: string } | null> {
  const authHeader = req.headers.get('authorization');
  const xApiKey = req.headers.get('x-api-key');
  const apiKey = authHeader?.replace('Bearer ', '') || xApiKey;
  
  if (!apiKey) return null;
  
  // Check for mock API secret (allows GM to post as any agent)
  if (process.env.MOCK_API_SECRET && apiKey === process.env.MOCK_API_SECRET) {
    // If author_name specified, find or create that agent
    if (authorName) {
      const { data: existingAgent } = await supabaseAdmin
        .from('agents')
        .select('id, name')
        .eq('name', authorName)
        .single();
      
      if (existingAgent) return existingAgent;
      
      // Create mock agent for testing
      const { data: newAgent } = await supabaseAdmin
        .from('agents')
        .insert({
          name: authorName,
          api_key: `mock_${randomUUID().replace(/-/g, '')}`,
          wallet_pubkey: 'mock_' + authorName,
        })
        .select('id, name')
        .single();
      
      return newAgent || { id: 'mock-' + authorName, name: authorName };
    }
    
    // Default to GM
    const { data: gmAgent } = await supabaseAdmin
      .from('agents')
      .select('id, name')
      .eq('name', 'MoltMob_GM')
      .single();
    return gmAgent || { id: 'mock-gm', name: 'MoltMob_GM' };
  }
  
  // Otherwise check API key in database
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
  { params }: { params: Promise<{ id: string }> }
) {
  const agent = await getAgentFromAuth(req);
  if (!agent) {
    return NextResponse.json({ success: false, error: 'Invalid API key', code: 401 }, { status: 401 });
  }

  const { id } = await params;
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
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ success: false, error: 'Invalid post ID format', code: 400 }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body', code: 400 }, { status: 400 });
  }

  // Get agent - pass author_name to allow posting as different agents
  const agent = await getAgentFromAuth(req, body.author_name);
  if (!agent) {
    return NextResponse.json({ success: false, error: 'Invalid API key', code: 401 }, { status: 401 });
  }

  try {

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
