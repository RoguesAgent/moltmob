// Link a mock post to a game pod
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: postId } = await params;
  
  // Check admin auth
  const authHeader = req.headers.get('authorization');
  const apiKey = authHeader?.replace('Bearer ', '');
  if (apiKey !== process.env.GM_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { pod_id } = body;

    if (!pod_id) {
      return NextResponse.json({ error: 'pod_id is required' }, { status: 400 });
    }

    // Verify pod exists
    const { data: pod, error: podError } = await supabaseAdmin
      .from('game_pods')
      .select('id, pod_number')
      .eq('id', pod_id)
      .single();

    if (podError || !pod) {
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }

    // Update post with pod_id
    const { data: post, error: postError } = await supabaseAdmin
      .from('posts')
      .update({ pod_id })
      .eq('id', postId)
      .select('id, title, pod_id')
      .single();

    if (postError) {
      // Column might not exist yet - try without it
      if (postError.message?.includes('pod_id')) {
        return NextResponse.json({ 
          error: 'pod_id column not yet created. Run migration: 20260211012700_add_pod_id_to_posts.sql',
          migration: 'ALTER TABLE posts ADD COLUMN IF NOT EXISTS pod_id uuid REFERENCES game_pods(id);'
        }, { status: 500 });
      }
      return NextResponse.json({ error: postError.message }, { status: 500 });
    }

    // Also update the pod with the moltbook_post_id
    await supabaseAdmin
      .from('game_pods')
      .update({ moltbook_post_id: postId })
      .eq('id', pod_id);

    return NextResponse.json({ 
      success: true, 
      post,
      pod: { id: pod.id, pod_number: pod.pod_number },
      message: `Linked post to Pod #${pod.pod_number}`
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
