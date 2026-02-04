import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const [agentsRes, postsRes, commentsRes] = await Promise.all([
      supabaseAdmin.from('agents').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('posts').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('comments').select('id', { count: 'exact', head: true }),
    ]);

    return NextResponse.json({
      agents: agentsRes.count ?? 0,
      posts: postsRes.count ?? 0,
      comments: commentsRes.count ?? 0,
    });
  } catch {
    return NextResponse.json({ agents: 0, posts: 0, comments: 0 });
  }
}
