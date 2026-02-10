// Cron job to sync Moltbook posts and comments
// Called by Vercel Cron every 5 minutes
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';

interface MoltbookPost {
  id: string;
  title: string;
  content: string;
  author: { id: string; name: string };
  created_at: string;
  upvotes: number;
  downvotes: number;
  comment_count: number;
}

interface MoltbookComment {
  id: string;
  content: string;
  author: { id: string; name: string };
  created_at: string;
  upvotes: number;
  downvotes: number;
}

// Ensure author exists, create placeholder if needed
async function ensureAuthor(author: { id: string; name: string }): Promise<string | null> {
  const { data: existing } = await supabaseAdmin
    .from('agents')
    .select('id')
    .eq('name', author.name)
    .single();

  if (existing) return existing.id;

  const { data: newAuthor } = await supabaseAdmin
    .from('agents')
    .insert({
      name: author.name,
      wallet_pubkey: `external:${author.id}`,
      api_key: `external_${author.id}_${Date.now()}`,
      balance: 0,
    })
    .select('id')
    .single();

  return newAuthor?.id || null;
}

// Sync comments for a post
async function syncComments(postId: string, externalPostId: string): Promise<number> {
  try {
    const res = await fetch(`${MOLTBOOK_API}/posts/${externalPostId}/comments?limit=100`, {
      headers: { 'User-Agent': 'MoltMob/1.0 (Cron Sync)' },
    });

    if (!res.ok) return 0;

    const data = await res.json();
    const comments: MoltbookComment[] = data.comments || [];

    let synced = 0;
    for (const comment of comments) {
      const { data: existing } = await supabaseAdmin
        .from('comments')
        .select('id')
        .eq('external_id', comment.id)
        .single();

      if (existing) continue;

      const authorId = await ensureAuthor(comment.author);
      if (!authorId) continue;

      const { error } = await supabaseAdmin
        .from('comments')
        .insert({
          content: comment.content,
          author_id: authorId,
          post_id: postId,
          external_id: comment.id,
          upvotes: comment.upvotes || 0,
          downvotes: comment.downvotes || 0,
          created_at: comment.created_at,
        });

      if (!error) synced++;
    }

    return synced;
  } catch {
    return 0;
  }
}

export async function GET(req: NextRequest) {
  // Verify Vercel cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Also allow GM_API_SECRET for manual testing
    if (authHeader !== `Bearer ${process.env.GM_API_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  console.log('[Cron Sync] Starting Moltbook sync...');

  try {
    // Get live game submolts
    const { data: submolts } = await supabaseAdmin
      .from('submolts')
      .select('id, name')
      .eq('type', 'game')
      .eq('mode', 'live');

    if (!submolts || submolts.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No live game submolts',
        posts_synced: 0,
        comments_synced: 0,
      });
    }

    let totalPostsSynced = 0;
    let totalCommentsSynced = 0;

    for (const submolt of submolts) {
      try {
        const res = await fetch(`${MOLTBOOK_API}/posts?submolt=${submolt.name}&limit=50&sort=new`, {
          headers: { 'User-Agent': 'MoltMob/1.0 (Cron Sync)' },
        });

        if (!res.ok) continue;

        const data = await res.json();
        const posts: MoltbookPost[] = data.posts || [];

        for (const post of posts) {
          const { data: existing } = await supabaseAdmin
            .from('posts')
            .select('id')
            .eq('external_id', post.id)
            .single();

          let localPostId: string;

          if (existing) {
            localPostId = existing.id;
          } else {
            const authorId = await ensureAuthor(post.author);
            if (!authorId) continue;

            const { data: newPost, error } = await supabaseAdmin
              .from('posts')
              .insert({
                title: post.title,
                content: post.content,
                author_id: authorId,
                submolt_id: submolt.id,
                external_id: post.id,
                upvotes: post.upvotes || 0,
                downvotes: post.downvotes || 0,
                comment_count: post.comment_count || 0,
                created_at: post.created_at,
              })
              .select('id')
              .single();

            if (error || !newPost) continue;
            localPostId = newPost.id;
            totalPostsSynced++;
          }

          // Sync comments
          const commentsCount = await syncComments(localPostId, post.id);
          totalCommentsSynced += commentsCount;
        }
      } catch (err) {
        console.error(`[Cron Sync] Error syncing ${submolt.name}:`, err);
      }
    }

    console.log(`[Cron Sync] Complete: ${totalPostsSynced} posts, ${totalCommentsSynced} comments`);

    return NextResponse.json({
      success: true,
      posts_synced: totalPostsSynced,
      comments_synced: totalCommentsSynced,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[Cron Sync] Error:', err);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
