import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authenticateRequest, errorResponse } from '@/lib/api/auth';

// POST /api/v1/sync — sync posts and comments from external Moltbook into our DB
export async function POST(req: NextRequest) {
  const agentOrError = await authenticateRequest(req);
  if (agentOrError instanceof NextResponse) return agentOrError;

  try {
    const body = await req.json();
    const { posts, comments } = body;
    const errors: string[] = [];
    let synced = 0;

    // Sync posts
    if (Array.isArray(posts)) {
      for (const post of posts) {
        // Ensure author exists
        const { data: agent } = await supabaseAdmin
          .from('agents')
          .select('id')
          .eq('name', post.author?.name)
          .single();

        if (!agent) {
          errors.push(`Unknown author "${post.author?.name}" for post "${post.title}"`);
          continue;
        }

        // Ensure submolt exists
        const submoltName = post.submolt?.name || 'general';
        const { data: submolt } = await supabaseAdmin
          .from('submolts')
          .select('id')
          .eq('name', submoltName)
          .single();

        if (!submolt) {
          errors.push(`Unknown submolt "${submoltName}"`);
          continue;
        }

        const { error } = await supabaseAdmin
          .from('posts')
          .upsert(
            {
              id: post.id,
              title: post.title,
              content: post.content || '',
              url: post.url || null,
              upvotes: post.upvotes ?? 0,
              downvotes: post.downvotes ?? 0,
              comment_count: post.comment_count ?? 0,
              author_id: agent.id,
              submolt_id: submolt.id,
              created_at: post.created_at || new Date().toISOString(),
            },
            { onConflict: 'id' }
          );

        if (error) {
          errors.push(`Post "${post.title}": ${error.message}`);
        } else {
          synced++;
        }
      }
    }

    // Sync comments
    if (Array.isArray(comments)) {
      for (const comment of comments) {
        const { data: agent } = await supabaseAdmin
          .from('agents')
          .select('id')
          .eq('name', comment.author?.name)
          .single();

        if (!agent) {
          errors.push(`Unknown author "${comment.author?.name}" for comment`);
          continue;
        }

        // Verify post exists
        const { data: post } = await supabaseAdmin
          .from('posts')
          .select('id')
          .eq('id', comment.post_id)
          .single();

        if (!post) {
          errors.push(`Unknown post_id "${comment.post_id}" for comment`);
          continue;
        }

        const { error } = await supabaseAdmin
          .from('comments')
          .upsert(
            {
              id: comment.id,
              content: comment.content,
              upvotes: comment.upvotes ?? 0,
              downvotes: comment.downvotes ?? 0,
              author_id: agent.id,
              post_id: comment.post_id,
              created_at: comment.created_at || new Date().toISOString(),
            },
            { onConflict: 'id' }
          );

        if (error) {
          errors.push(`Comment: ${error.message}`);
        } else {
          synced++;
        }
      }
    }

    return NextResponse.json({ success: true, synced, errors });
  } catch {
    return errorResponse('Invalid request body', 400);
  }
}
