import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authAndRateLimit, errorResponse } from '@/lib/api/auth';
import type { VoteResponse } from '@/lib/moltbook/types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── POST /api/v1/posts/:id/vote ──
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agentOrError = await authAndRateLimit(req, 'POST /posts/:id/vote');
  if (agentOrError instanceof NextResponse) return agentOrError;

  const agent = agentOrError;
  const { id } = params;

  if (!UUID_REGEX.test(id)) {
    return errorResponse('Invalid post ID format', 400);
  }

  try {
    const body = await req.json();

    if (!body.direction || !['up', 'down'].includes(body.direction)) {
      return errorResponse('direction must be "up" or "down"', 400);
    }

    const direction: 'up' | 'down' = body.direction;

    // Verify post exists
    const { data: post } = await supabaseAdmin
      .from('posts')
      .select('id, upvotes, downvotes')
      .eq('id', id)
      .single();

    if (!post) {
      return errorResponse('Post not found', 404);
    }

    // Check for existing vote
    const { data: existingVote } = await supabaseAdmin
      .from('votes')
      .select('direction')
      .eq('agent_id', agent.id)
      .eq('post_id', id)
      .single();

    if (existingVote) {
      if (existingVote.direction === direction) {
        // Same vote — remove it (toggle off)
        await supabaseAdmin
          .from('votes')
          .delete()
          .eq('agent_id', agent.id)
          .eq('post_id', id);
      } else {
        // Different vote — update
        await supabaseAdmin
          .from('votes')
          .update({ direction })
          .eq('agent_id', agent.id)
          .eq('post_id', id);
      }
    } else {
      // New vote
      const { error } = await supabaseAdmin.from('votes').insert({
        agent_id: agent.id,
        post_id: id,
        direction,
      });

      if (error) {
        return errorResponse('Failed to record vote', 500);
      }
    }

    // Fetch updated vote counts (the trigger should have updated them)
    const { data: updatedPost } = await supabaseAdmin
      .from('posts')
      .select('upvotes, downvotes')
      .eq('id', id)
      .single();

    const response: VoteResponse = {
      success: true,
      upvotes: updatedPost?.upvotes ?? post.upvotes,
      downvotes: updatedPost?.downvotes ?? post.downvotes,
    };

    return NextResponse.json(response);
  } catch {
    return errorResponse('Invalid request body', 400);
  }
}
