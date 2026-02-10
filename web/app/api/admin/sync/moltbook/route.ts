// Sync posts and comments from real Moltbook to local database
// Only syncs submolts with type='game' AND mode='live'
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';

interface MoltbookPost {
  id: string;
  title: string;
  content: string;
  author: { id: string; name: string };
  submolt: { name: string };
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

  // Create placeholder agent for external author
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
async function syncComments(postId: string, externalPostId: string, submoltName: string): Promise<number> {
  try {
    const res = await fetch(`${MOLTBOOK_API}/posts/${externalPostId}/comments?limit=100`, {
      headers: { 'User-Agent': 'MoltMob/1.0 (Sync)' },
    });

    if (!res.ok) {
      console.log(`[Sync] Failed to fetch comments for post ${externalPostId}: ${res.status}`);
      return 0;
    }

    const data = await res.json();
    const comments: MoltbookComment[] = data.comments || [];

    let synced = 0;
    for (const comment of comments) {
      // Check if comment already exists
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
  } catch (err) {
    console.error(`[Sync] Error syncing comments for ${externalPostId}:`, err);
    return 0;
  }
}

// POST /api/admin/sync/moltbook — sync posts and comments from real Moltbook
export async function POST(req: NextRequest) {
  // Auth via GM_API_SECRET or ADMIN_SECRET
  const authHeader = req.headers.get('authorization');
  const adminSecret = req.headers.get('x-admin-secret');
  const token = authHeader?.replace('Bearer ', '') || adminSecret;
  
  if (token !== process.env.GM_API_SECRET && token !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get submolts that should sync: type='game' AND mode='live'
    const { data: submolts } = await supabaseAdmin
      .from('submolts')
      .select('id, name, type, mode')
      .eq('type', 'game')
      .eq('mode', 'live');

    if (!submolts || submolts.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No live game submolts to sync', 
        posts_synced: 0,
        comments_synced: 0,
      });
    }

    let totalPostsSynced = 0;
    let totalCommentsSynced = 0;
    const results: Record<string, { posts: number; comments: number }> = {};

    for (const submolt of submolts) {
      try {
        // Fetch posts from real Moltbook
        const res = await fetch(`${MOLTBOOK_API}/posts?submolt=${submolt.name}&limit=50&sort=new`, {
          headers: { 'User-Agent': 'MoltMob/1.0 (Sync)' },
        });

        if (!res.ok) {
          console.log(`[Sync] Failed to fetch from Moltbook for ${submolt.name}: ${res.status}`);
          results[submolt.name] = { posts: 0, comments: 0 };
          continue;
        }

        const data = await res.json();
        const posts: MoltbookPost[] = data.posts || [];

        let postsSynced = 0;
        let commentsSynced = 0;

        for (const post of posts) {
          // Check if post already exists (by external_id)
          const { data: existing } = await supabaseAdmin
            .from('posts')
            .select('id')
            .eq('external_id', post.id)
            .single();

          let localPostId: string;

          if (existing) {
            // Post exists, just sync comments
            localPostId = existing.id;
          } else {
            // New post, insert it
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
            postsSynced++;
          }

          // Sync comments for this post
          const commentsCount = await syncComments(localPostId, post.id, submolt.name);
          commentsSynced += commentsCount;
        }

        results[submolt.name] = { posts: postsSynced, comments: commentsSynced };
        totalPostsSynced += postsSynced;
        totalCommentsSynced += commentsSynced;

      } catch (err) {
        console.error(`[Sync] Error syncing ${submolt.name}:`, err);
        results[submolt.name] = { posts: 0, comments: 0 };
      }
    }

    return NextResponse.json({
      success: true,
      posts_synced: totalPostsSynced,
      comments_synced: totalCommentsSynced,
      results,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[Sync] Error:', err);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}

// GET /api/admin/sync/moltbook — get sync status
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const adminSecret = req.headers.get('x-admin-secret');
  const token = authHeader?.replace('Bearer ', '') || adminSecret;
  
  if (token !== process.env.GM_API_SECRET && token !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get submolts with sync info
  const { data: submolts } = await supabaseAdmin
    .from('submolts')
    .select('id, name, display_name, type, mode')
    .order('name');

  // Get post counts per submolt
  const { data: posts } = await supabaseAdmin
    .from('posts')
    .select('id, submolt_id, external_id');

  // Get comment counts
  const { data: comments } = await supabaseAdmin
    .from('comments')
    .select('post_id, external_id');

  const postCounts: Record<string, { total: number; synced: number }> = {};
  const commentCounts: Record<string, { total: number; synced: number }> = {};

  for (const post of posts || []) {
    if (!postCounts[post.submolt_id]) {
      postCounts[post.submolt_id] = { total: 0, synced: 0 };
    }
    postCounts[post.submolt_id].total++;
    if (post.external_id) postCounts[post.submolt_id].synced++;
  }

  // Map comments to submolts via posts
  const postToSubmolt: Record<string, string> = {};
  for (const post of posts || []) {
    postToSubmolt[post.id] = post.submolt_id;
  }

  for (const comment of comments || []) {
    const submoltId = postToSubmolt[comment.post_id];
    if (!submoltId) continue;
    if (!commentCounts[submoltId]) {
      commentCounts[submoltId] = { total: 0, synced: 0 };
    }
    commentCounts[submoltId].total++;
    if (comment.external_id) commentCounts[submoltId].synced++;
  }

  return NextResponse.json({
    submolts: (submolts || []).map(s => ({
      ...s,
      posts: postCounts[s.id] || { total: 0, synced: 0 },
      comments: commentCounts[s.id] || { total: 0, synced: 0 },
    })),
  });
}
