import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authAndRateLimit, errorResponse } from '@/lib/api/auth';
import type { PostResponse } from '@/lib/moltbook/types';

// ── GET /api/v1/posts/:id ──
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentOrError = await authAndRateLimit(req, 'GET /posts/:id');
  if (agentOrError instanceof NextResponse) return agentOrError;

  const { id } = params;

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return errorResponse('Invalid post ID format', 400);
  }

  const { data: post, error } = await supabaseAdmin
    .from('posts')
    .select(
      `
      id, title, content, url, upvotes, downvotes, comment_count, created_at,
      author:agents!author_id(id, name),
      submolt:submolts!submolt_id(id, name, display_name)
    `
    )
    .eq('id', id)
    .single();

  if (error || !post) {
    return errorResponse('Post not found', 404);
  }

  // Supabase returns joined relations — extract single object
  const author = Array.isArray(post.author) ? post.author[0] : post.author;
  const submolt = Array.isArray(post.submolt) ? post.submolt[0] : post.submolt;

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
      author: { id: author.id, name: author.name },
      submolt: { id: submolt.id, name: submolt.name, display_name: submolt.display_name },
    },
  };

  return NextResponse.json(response);
}
