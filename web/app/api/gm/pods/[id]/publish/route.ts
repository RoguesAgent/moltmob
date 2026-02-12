/**
 * GM Publish API — Post to Moltbook thread (GM access only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const GM_SECRET = process.env.GM_API_SECRET;
const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';

function verifyGmSecret(req: NextRequest): boolean {
  const secret = req.headers.get('x-gm-secret') || 
                 req.headers.get('authorization')?.replace('Bearer ', '');
  return !!GM_SECRET && secret === GM_SECRET;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyGmSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id: podId } = await params;
    const body = await req.json();
    const { title, content } = body;

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    // Get pod to find Moltbook post ID
    const { data: pod, error: podError } = await supabaseAdmin
      .from('game_pods')
      .select('id, pod_number, moltbook_post_id, moltbook_mode')
      .eq('id', podId)
      .single();

    if (podError || !pod) {
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }

    // If mock mode, just log and return success
    if (pod.moltbook_mode === 'mock' || !pod.moltbook_post_id) {
      console.log(`[GM Publish] Mock mode - Pod ${pod.pod_number}: ${title || 'Comment'}`);
      
      // Record in gm_events
      await supabaseAdmin.from('gm_events').insert({
        pod_id: podId,
        event_type: 'gm_post',
        summary: title || 'GM Comment',
        details: { content, mock: true },
      });

      return NextResponse.json({ 
        success: true, 
        mock: true,
        message: 'Posted (mock mode)' 
      });
    }

    // Live mode: post to real Moltbook
    let postId = pod.moltbook_post_id;

    if (title) {
      // Create new top-level post
      const res = await fetch(`${MOLTBOOK_API}/posts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GM_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          content,
          submolt: 'moltmob',
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json({ error: `Moltbook error: ${err}` }, { status: 502 });
      }

      const data = await res.json();
      postId = data.post?.id || data.id;

      // Update pod with new post ID
      await supabaseAdmin
        .from('game_pods')
        .update({ moltbook_post_id: postId })
        .eq('id', podId);
    } else {
      // Comment on existing thread
      const res = await fetch(`${MOLTBOOK_API}/posts/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GM_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json({ error: `Moltbook error: ${err}` }, { status: 502 });
      }
    }

    // Record in gm_events
    await supabaseAdmin.from('gm_events').insert({
      pod_id: podId,
      event_type: 'gm_post',
      summary: title || 'GM Comment',
      details: { content, post_id: postId },
    });

    return NextResponse.json({ 
      success: true,
      post_id: postId,
      message: title ? 'Post created' : 'Comment posted'
    });
  } catch (err) {
    return NextResponse.json({ 
      error: err instanceof Error ? err.message : 'Unknown error' 
    }, { status: 500 });
  }
}
