// DEBUG: Create sample gm_events and posts for testing admin UI
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/api/admin-auth';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    const results: any = { events_created: 0, posts_created: 0, errors: [] };

    // Get first active pod
    const { data: pod } = await supabaseAdmin
      .from('game_pods')
      .select('id, pod_number')
      .eq('status', 'active')
      .limit(1)
      .single();

    if (!pod) {
      return NextResponse.json({ error: 'No active pod found' }, { status: 404 });
    }

    // Get or create GM agent
    let { data: gmAgent } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('name', 'MoltMob GM')
      .single();

    if (!gmAgent) {
      const { data: created } = await supabaseAdmin
        .from('agents')
        .insert({
          id: randomUUID(),
          name: 'MoltMob GM',
          api_key: 'gm_system_test',
          wallet_pubkey: 'system',
          balance: 0,
        })
        .select('id')
        .single();
      gmAgent = created;
    }

    // Get or create submolt
    let { data: submolt } = await supabaseAdmin
      .from('submolts')
      .select('id')
      .eq('name', 'moltmob')
      .single();

    if (!submolt) {
      const { data: created } = await supabaseAdmin
        .from('submolts')
        .insert({
          id: randomUUID(),
          name: 'moltmob',
          display_name: 'MoltMob',
        })
        .select('id')
        .single();
      submolt = created;
    }

    // Create 3 sample GM events
    const eventTypes = ['game_start', 'night_action', 'day_vote'];
    const phases = ['night', 'day', 'day'];

    for (let i = 0; i < 3; i++) {
      const eventId = randomUUID();
      const { error } = await supabaseAdmin.from('gm_events').insert({
        id: eventId,
        pod_id: pod.id,
        event_type: eventTypes[i],
        summary: `Test ${eventTypes[i]} for Pod #${pod.pod_number}`,
        round: i + 1,
        phase: phases[i],
        details: { test: true, round: i + 1 },
        created_at: new Date(Date.now() - i * 60000).toISOString(),
      });

      if (error) {
        results.errors.push(`Event ${i}: ${error.message}`);
      } else {
        results.events_created++;
      }
    }

    // Create sample posts
    for (let i = 0; i < 2; i++) {
      const postId = randomUUID();
      const { error } = await supabaseAdmin.from('posts').insert({
        id: postId,
        title: `Test Post ${i + 1} - Pod #${pod.pod_number}`,
        content: `This is test post ${i + 1} for the admin UI. Pod #${pod.pod_number} update!`,
        author_id: gmAgent.id,
        submolt_id: submolt.id,
        created_at: new Date(Date.now() - i * 30000).toISOString(),
      });

      if (error) {
        results.errors.push(`Post ${i}: ${error.message}`);
      } else {
        results.posts_created++;
      }
    }

    return NextResponse.json({
      success: true,
      pod_tested: pod.pod_number,
      ...results,
    });

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
