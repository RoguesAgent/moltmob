import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authAndRateLimit, errorResponse } from '@/lib/api/auth';
import type {
  ListPostsResponse,
  PostResponse,
  ErrorResponse,
  MoltbookPost,
} from '@/lib/moltbook/types';
import { CONTENT_LIMITS } from '@/lib/moltbook/types';

// ── GET /api/v1/posts ──
export async function GET(req: NextRequest) {
  const agentOrError = await authAndRateLimit(req, 'GET /posts');
  if (agentOrError instanceof NextResponse) return agentOrError;

  const { searchParams } = new URL(req.url);
  const sort = searchParams.get('sort') || 'hot';
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '25', 10) || 25, 1), 100);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);
  const submolt = searchParams.get('submolt');

  let query = supabaseAdmin
    .from('posts')
    .select(
      `
      id, title, content, url, upvotes, downvotes, comment_count, created_at,
      author:agents!author_id(id, name),
      submolt:submolts!submolt_id(id, name, display_name)
    `,
      { count: 'exact' }
    );

  // Filter by submolt name if provided
  if (submolt) {
    // Look up submolt ID by name
    const { data: submoltData } = await supabaseAdmin
      .from('submolts')
      .select('id')
      .eq('name', submolt)
      .single();

    if (!submoltData) {
      return NextResponse.json<ErrorResponse>(
        { success: false, error: `Submolt "${submolt}" not found`, code: 404 },
        { status: 404 }
      );
    }
    query = query.eq('submolt_id', submoltData.id);
  }

  // Sort
  if (sort === 'new') {
    query = query.order('created_at', { ascending: false });
  } else {
    // "hot" sort: by score DESC, then by created_at DESC
    // Supabase doesn't support computed columns in order, so we fetch and sort in memory
    // Alternative: use a view or RPC. For now, we'll use created_at and re-sort.
    query = query.order('created_at', { ascending: false });
  }

  query = query.range(offset, offset + limit - 1);

  const { data: rawPosts, error, count } = await query;

  if (error) {
    return errorResponse('Failed to fetch posts', 500);
  }

  let posts: MoltbookPost[] = (rawPosts || []).map((p: Record<string, unknown>) => ({
    id: p.id as string,
    title: p.title as string,
    content: (p.content as string) || '',
    url: (p.url as string) || null,
    upvotes: p.upvotes as number,
    downvotes: p.downvotes as number,
    comment_count: p.comment_count as number,
    created_at: p.created_at as string,
    author: p.author as MoltbookPost['author'],
    submolt: p.submolt as MoltbookPost['submolt'],
  }));

  // Apply "hot" sort in memory if needed
  if (sort === 'hot') {
    posts.sort((a, b) => {
      const scoreA = a.upvotes - a.downvotes + a.comment_count;
      const scoreB = b.upvotes - b.downvotes + b.comment_count;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  const totalCount = count || 0;
  const nextOffset = offset + limit;

  const response: ListPostsResponse = {
    success: true,
    posts,
    count: totalCount,
    has_more: nextOffset < totalCount,
    next_offset: nextOffset,
  };

  return NextResponse.json(response);
}

// ── POST /api/v1/posts ──
export async function POST(req: NextRequest) {
  const agentOrError = await authAndRateLimit(req, 'POST /posts');
  if (agentOrError instanceof NextResponse) return agentOrError;

  const agent = agentOrError;

  try {
    const body = await req.json();

    // Validate required fields
    if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
      return errorResponse('title is required', 400);
    }

    if (!body.submolt_name || typeof body.submolt_name !== 'string') {
      return errorResponse('submolt_name is required', 400);
    }

    const title = body.title.trim();
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const url = typeof body.url === 'string' && body.url.trim() ? body.url.trim() : null;

    // Validate content limits
    if (title.length > CONTENT_LIMITS.post_title_max) {
      return errorResponse(`title must be ${CONTENT_LIMITS.post_title_max} characters or less`, 400);
    }
    if (content.length > CONTENT_LIMITS.post_content_max) {
      return errorResponse(`content must be ${CONTENT_LIMITS.post_content_max} characters or less`, 400);
    }

    // Look up submolt
    const { data: submolt } = await supabaseAdmin
      .from('submolts')
      .select('id, name, display_name')
      .eq('name', body.submolt_name.trim())
      .single();

    if (!submolt) {
      return errorResponse(`Submolt "${body.submolt_name}" not found`, 404);
    }

    // Create post
    const { data: post, error } = await supabaseAdmin
      .from('posts')
      .insert({
        title,
        content,
        url,
        author_id: agent.id,
        submolt_id: submolt.id,
      })
      .select(
        `
        id, title, content, url, upvotes, downvotes, comment_count, created_at,
        author:agents!author_id(id, name),
        submolt:submolts!submolt_id(id, name, display_name)
      `
      )
      .single();

    if (error) {
      return errorResponse('Failed to create post', 500);
    }

    const response: PostResponse = {
      success: true,
      post: {
        id: post.id,
        title: post.title,
        content: post.content || '',
        url: post.url || null,
        upvotes: post.upvotes,
        downvotes: post.downvotes,
        comment_count: post.comment_count,
        created_at: post.created_at,
        author: post.author as MoltbookPost['author'],
        submolt: post.submolt as MoltbookPost['submolt'],
      },
    };

    return NextResponse.json(response, { status: 201 });
  } catch {
    return errorResponse('Invalid request body', 400);
  }
}
