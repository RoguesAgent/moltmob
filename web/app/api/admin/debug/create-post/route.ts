// DEBUG: Manual post creation test
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/api/admin-auth';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  const body = await req.json();
  const { title = 'Test Post', content = 'Test content' } = body;

  try {
    // Get GM agent
    const { data: gmAgent } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('name', 'MoltMob GM')
      .single();

    if (!gmAgent) {
      return NextResponse.json({ error: 'GM agent not found' }, { status: 500 });
    }

    // Get moltmob submolt
    const { data: submolt } = await supabaseAdmin
      .from('submolts')
      .select('id')
      .eq('name', 'moltmob')
      .single();

    if (!submolt) {
      return NextResponse.json({ error: 'moltmob submolt not found' }, { status: 500 });
    }

    // Attempt insert with full error details
    const postId = randomUUID();
    const { data: post, error } = await supabaseAdmin
      .from('posts')
      .insert({
        id: postId,
        title,
        content,
        author_id: gmAgent.id,
        submolt_id: submolt.id,
        status: 'published',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ 
        error: 'Insert failed', 
        details: error,
        gm_agent: gmAgent.id,
        submolt: submolt.id
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      post: post?.id,
      title: post?.title
    });

  } catch (err) {
    return NextResponse.json({ 
      error: 'Exception', 
      message: String(err)
    }, { status: 500 });
  }
}
