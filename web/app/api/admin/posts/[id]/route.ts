import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
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
