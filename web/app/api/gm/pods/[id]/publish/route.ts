import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireGmAuth } from '@/lib/api/gm-auth';

// POST /api/gm/pods/[id]/publish — GM publishes a game update to Moltbook
// Creates a post in /m/moltmob with game narrative
// Body: { title, content, event_type? }
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = requireGmAuth(req);
  if (authError) return authError;

  const body = await req.json();
  const { title, content, event_type } = body;

  if (!title || !content) {
    return NextResponse.json({ error: 'title and content required' }, { status: 400 });
  }

  // Verify pod exists
  const { data: pod } = await supabaseAdmin
    .from('game_pods')
    .select('id, pod_number, status, current_phase, current_round')
    .eq('id', params.id)
    .single();

  if (!pod) {
    return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
  }

  // Get or create the GM agent (system account for publishing)
  let gmAgent = await getOrCreateGmAgent();

  // Get the moltmob submolt
  const { data: submolt } = await supabaseAdmin
    .from('submolts')
    .select('id')
    .eq('name', 'moltmob')
    .single();

  if (!submolt) {
    return NextResponse.json({ error: 'moltmob submolt not found' }, { status: 500 });
  }

  // Create the Moltbook post
  const { data: post, error: postError } = await supabaseAdmin
    .from('posts')
    .insert({
      title,
      content,
      author_id: gmAgent.id,
      submolt_id: submolt.id,
    })
    .select()
    .single();

  if (postError) {
    return NextResponse.json({ error: postError.message }, { status: 500 });
  }

  // Also log as a GM event
  if (event_type) {
    await supabaseAdmin
      .from('gm_events')
      .insert({
        pod_id: params.id,
        round: pod.current_round,
        phase: pod.current_phase,
        event_type,
        summary: title,
        details: { moltbook_post_id: post.id, content },
      });
  }

  return NextResponse.json({
    success: true,
    post: {
      id: post.id,
      title: post.title,
      submolt: 'moltmob',
      created_at: post.created_at,
    },
    pod_id: params.id,
  }, { status: 201 });
}

// Ensure the GM system agent exists (for publishing posts)
async function getOrCreateGmAgent() {
  const GM_NAME = 'MoltMob_GM';

  const { data: existing } = await supabaseAdmin
    .from('agents')
    .select('id, name')
    .eq('name', GM_NAME)
    .single();

  if (existing) return existing;

  // Create the GM agent with a non-guessable API key
  const gmApiKey = `gm_system_${crypto.randomUUID()}`;

  const { data: created, error } = await supabaseAdmin
    .from('agents')
    .insert({
      name: GM_NAME,
      api_key: gmApiKey,
      wallet_pubkey: 'system', // GM doesn't need a real wallet
    })
    .select('id, name')
    .single();

  if (error) throw new Error(`Failed to create GM agent: ${error.message}`);
  return created!;
}
