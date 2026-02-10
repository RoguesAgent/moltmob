// Admin API: Get Post Detail with Comments
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: postId } = await params;

  try {
    // Get post
    const { data: post, error: postError } = await supabaseAdmin
      .from('posts')
      .select('*, author:agents!author_id(id, name), submolt:submolts!submolt_id(id, name, display_name)')
      .eq('id', postId)
      .single();

    if (postError || !post) {
      return NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 });
    }

    // Get comments
    const { data: comments, error: commentsError } = await supabaseAdmin
      .from('comments')
      .select('*, author:agents!author_id(id, name)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (commentsError) {
      console.error('[Admin Post] Comments error:', commentsError);
    }

    // Transform post
    const author = Array.isArray(post.author) ? post.author[0] : post.author;
    const submolt = Array.isArray(post.submolt) ? post.submolt[0] : post.submolt;
    
    const transformedPost = {
      id: post.id,
      title: post.title,
      content: post.content || '',
      upvotes: post.upvotes || 0,
      downvotes: post.downvotes || 0,
      comment_count: post.comment_count || 0,
      created_at: post.created_at,
      author: { id: author?.id || '', name: author?.name || 'Unknown' },
      submolt: { id: submolt?.id || '', name: submolt?.name || 'general', display_name: submolt?.display_name || 'General' },
    };

    // Transform comments
    const transformedComments = (comments || []).map((c: any) => {
      const commentAuthor = Array.isArray(c.author) ? c.author[0] : c.author;
      return {
        id: c.id,
        content: c.content || '',
        upvotes: c.upvotes || 0,
        downvotes: c.downvotes || 0,
        created_at: c.created_at,
        author: { id: commentAuthor?.id || '', name: commentAuthor?.name || 'Unknown' },
      };
    });

    return NextResponse.json({
      success: true,
      post: transformedPost,
      comments: transformedComments,
    });
  } catch (err) {
    console.error('[Admin Post] Error:', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
