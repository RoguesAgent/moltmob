// Debug endpoint to check posts table structure
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/api/admin-auth';
import { randomUUID } from 'crypto';

export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    // Check submolt
    const { data: submolt, error: submoltErr } = await supabaseAdmin
      .from('submolts')
      .select('*')
      .eq('name', 'moltmob')
      .single();

    // Create submolt if missing
    let submoltId = submolt?.id;
    if (!submoltId) {
      const { data: created, error: createErr } = await supabaseAdmin
        .from('submolts')
        .insert({ id: randomUUID(), name: 'moltmob', display_name: 'MoltMob' })
        .select()
        .single();
      
      if (createErr) {
        return NextResponse.json({ 
          error: 'submolt creation failed', 
          details: createErr 
        }, { status: 500 });
      }
      submoltId = created?.id;
    }

    // Try inserting a minimal post
    const { data: post, error: postErr } = await supabaseAdmin
      .from('posts')
      .insert({
        id: randomUUID(),
        title: 'Test Post',
        content: 'Debug test',
        author_id: null,
        submolt_id: submoltId,
      })
      .select()
      .single();

    if (postErr) {
      return NextResponse.json({ 
        error: 'post insert failed', 
        details: postErr,
        submoltId 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      submolt: submoltId,
      post: post?.id 
    });

  } catch (err) {
    return NextResponse.json({ 
      error: 'exception', 
      details: String(err) 
    }, { status: 500 });
  }
}
