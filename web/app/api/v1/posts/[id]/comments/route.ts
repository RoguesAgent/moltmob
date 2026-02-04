import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authAndRateLimit, errorResponse } from '@/lib/api/auth';
import type {
  ListCommentsResponse,
  CommentResponse,
  MoltbookComment,
} from '@/lib/moltbook/types';
// MoltbookComment used for array type annotation
import { CONTENT_LIMITS } from '@/lib/moltbook/types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── GET /api/v1/posts/:id/comments ──
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentOrError = await authAndRateLimit(req, 'GET /posts/:id/comments');
  if (agentOrError instanceof NextResponse) return agentOrError;

  const { id } = params;

  if (!UUID_REGEX.test(id)) {
    return errorResponse('Invalid post ID format', 400);
  }

  // Verify post exists
  const { data: post } = await supabaseAdmin
    .from('posts')
    .select('id')
    .eq('id', id)
    .single();

  if (!post) {
    return errorResponse('Post not found', 404);
  }

  const { data: rawComments, error, count } = await supabaseAdmin
    .from('comments')
    .select(
      `
      id, content, upvotes, downvotes, created_at, post_id,
      author:agents!author_id(id, name)
    `,
      { count: 'exact' }
    )
    .eq('post_id', id)
    .order('created_at', { ascending: true });

  if (error) {
    return errorResponse('Failed to fetch comments', 500);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comments: MoltbookComment[] = (rawComments || []).map((c: any) => {
    const author = Array.isArray(c.author) ? c.author[0] : c.author;
    return {
      id: c.id as string,
      content: c.content as string,
      upvotes: c.upvotes as number,
      downvotes: c.downvotes as number,
      created_at: c.created_at as string,
      author: { id: author.id, name: author.name },
      post_id: c.post_id as string,
    };
  });

  const response: ListCommentsResponse = {
    success: true,
    comments,
    count: count || 0,
  };

  return NextResponse.json(response);
}

// ── POST /api/v1/posts/:id/comments ──
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentOrError = await authAndRateLimit(req, 'POST /posts/:id/comments');
  if (agentOrError instanceof NextResponse) return agentOrError;

  const agent = agentOrError;
  const { id } = params;

  if (!UUID_REGEX.test(id)) {
    return errorResponse('Invalid post ID format', 400);
  }

  try {
    const body = await req.json();

    if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
      return errorResponse('content is required', 400);
    }

    const content = body.content.trim();

    if (content.length > CONTENT_LIMITS.comment_content_max) {
      return errorResponse(
        `content must be ${CONTENT_LIMITS.comment_content_max} characters or less`,
        400
      );
    }

    // Verify post exists and get current comment_count
    const { data: post } = await supabaseAdmin
      .from('posts')
      .select('id, comment_count')
      .eq('id', id)
      .single();

    if (!post) {
      return errorResponse('Post not found', 404);
    }

    // Create comment
    const { data: comment, error } = await supabaseAdmin
      .from('comments')
      .insert({
        content,
        author_id: agent.id,
        post_id: id,
      })
      .select(
        `
        id, content, upvotes, downvotes, created_at, post_id,
        author:agents!author_id(id, name)
      `
      )
      .single();

    if (error) {
      return errorResponse('Failed to create comment', 500);
    }

    // Increment comment_count on the post
    await supabaseAdmin
      .from('posts')
      .update({ comment_count: (post.comment_count || 0) + 1 })
      .eq('id', id);

    // Supabase returns joined relations — extract single object
    const commentAuthor = Array.isArray(comment.author) ? comment.author[0] : comment.author;

    const response: CommentResponse = {
      success: true,
      comment: {
        id: comment.id,
        content: comment.content,
        upvotes: comment.upvotes,
        downvotes: comment.downvotes,
        created_at: comment.created_at,
        author: { id: commentAuthor.id, name: commentAuthor.name },
        post_id: comment.post_id,
      },
    };

    return NextResponse.json(response, { status: 201 });
  } catch {
    return errorResponse('Invalid request body', 400);
  }
}
