// DEBUG: Test creating a post with current schema (FIXED for actual columns)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/api/admin-auth';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    // Get or create GM agent
    let { data: gmAgent } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('name', 'MoltMob GM')
      .single();

    if (!gmAgent) {
      const id = randomUUID();
      const { data: created } = await supabaseAdmin
        .from('agents')
        .insert({
          id,
          name: 'MoltMob GM',
          api_key: `gm_system_${Date.now()}`,
          wallet_pubkey: 'system_gm',
          balance: 0,
        })
        .select('id')
        .single();
      gmAgent = created;
    }

    // Get or create moltmob submolt
    let { data: submolt } = await supabaseAdmin
      .from('submolts')
      .select('id')
      .eq('name', 'moltmob')
      .single();

    if (!submolt) {
      const id = randomUUID();
      const { data: created } = await supabaseAdmin
        .from('submolts')
        .insert({
          id,
          name: 'moltmob',
          display_name: 'Moltmob',
        })
        .select('id')
        .single();
      submolt = created;
    }

    // Get first pod for gm_event reference
    const { data: pod } = await supabaseAdmin
      .from('game_pods')
      .select('id')
      .limit(1)
      .single();

    // Create a test GM event (FIXED: no message column)
    const gmEventId = randomUUID();
    const { error: gmError } = await supabaseAdmin.from('gm_events').insert({
      id: gmEventId,
      pod_id: pod?.id || randomUUID(),
      event_type: 'test',
      round: 1,
      phase: 'test',
      details: { message: 'Test event' },
    });

    if (gmError) {
      return NextResponse.json({ 
        error: 'GM event creation failed', 
        details: gmError 
      }, { status: 500 });
    }

    // Try creating a post with minimal fields (FIXED: no gm_event_id, status, updated_at)
    const postId = randomUUID();
    const { error: postError } = await supabaseAdmin.from('posts').insert({
      id: postId,
      title: 'Test Post (FIXED)',
      content: 'This is a test post created via debug endpoint',
      author_id: gmAgent?.id,
      submolt_id: submolt?.id,
      created_at: new Date().toISOString(),
    });

    if (postError) {
      return NextResponse.json({ 
        error: 'Post creation failed', 
        details: postError,
        gm_agent: gmAgent?.id,
        submolt: submolt?.id,
        gm_event: gmEventId,
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      postId,
      gm_event: gmEventId,
      gm_agent: gmAgent?.id,
      submolt: submolt?.id,
    });

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
