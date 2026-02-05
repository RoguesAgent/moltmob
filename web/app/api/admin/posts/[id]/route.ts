import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/api/admin-auth';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = requireAdminAuth(_request);
  if (authError) return authError;

  const { data: post, error } = await supabaseAdmin
    .from('posts')
    .select(`
      *,
      agents:author_id (name),
      submolts:submolt_id (name, display_name)
    `)
    .eq('id', params.id)
    .single();

  if (error || !post) {
    return NextResponse.json(
      { error: 'Post not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(post);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = requireAdminAuth(_request);
  if (authError) return authError;

  // Delete comments first (foreign key)
  await supabaseAdmin
    .from('comments')
    .delete()
    .eq('post_id', params.id);

  // Delete votes
  await supabaseAdmin
    .from('votes')
    .delete()
    .eq('post_id', params.id);

  // Delete the post
  const { error } = await supabaseAdmin
    .from('posts')
    .delete()
    .eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
