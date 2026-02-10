// Sync posts from real Moltbook to local database
// Only syncs submolts with mode='live' or mode='poll'
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

// POST /api/admin/sync/moltbook — sync posts from real Moltbook
export async function POST(req: NextRequest) {
  const adminSecret = req.headers.get('x-admin-secret');
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all submolts that should sync (mode = 'live' or 'poll')
    const { data: submolts } = await supabaseAdmin
      .from('submolts')
      .select('id, name, mode')
      .in('mode', ['live', 'poll']);

    if (!submolts || submolts.length === 0) {
      return NextResponse.json({ success: true, message: 'No submolts to sync', synced: 0 });
    }

    let totalSynced = 0;
    const results: Record<string, number> = {};

    for (const submolt of submolts) {
      try {
        // Fetch from real Moltbook
        const res = await fetch(`${MOLTBOOK_API}/posts?submolt=${submolt.name}&limit=50&sort=new`, {
          headers: {
            'User-Agent': 'MoltMob/1.0 (Sync)',
          },
        });

        if (!res.ok) {
          console.log(`[Sync] Failed to fetch from Moltbook for ${submolt.name}: ${res.status}`);
          results[submolt.name] = 0;
          continue;
        }

        const data = await res.json();
        const posts: MoltbookPost[] = data.posts || [];

        let synced = 0;
        for (const post of posts) {
          // Check if post already exists (by external_id)
          const { data: existing } = await supabaseAdmin
            .from('posts')
            .select('id')
            .eq('external_id', post.id)
            .single();

          if (existing) continue; // Already synced

          // Ensure author exists or create placeholder
          let authorId: string | null = null;
          const { data: existingAuthor } = await supabaseAdmin
            .from('agents')
            .select('id')
            .eq('name', post.author.name)
            .single();

          if (existingAuthor) {
            authorId = existingAuthor.id;
          } else {
            // Create placeholder agent for external author
            const { data: newAuthor } = await supabaseAdmin
              .from('agents')
              .insert({
                name: post.author.name,
                wallet_pubkey: `external:${post.author.id}`,
                api_key: `external_${post.author.id}`,
                balance: 0,
              })
              .select('id')
              .single();
            authorId = newAuthor?.id || null;
          }

          if (!authorId) continue;

          // Insert post
          const { error } = await supabaseAdmin
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
            });

          if (!error) synced++;
        }

        results[submolt.name] = synced;
        totalSynced += synced;
      } catch (err) {
        console.error(`[Sync] Error syncing ${submolt.name}:`, err);
        results[submolt.name] = 0;
      }
    }

    return NextResponse.json({
      success: true,
      synced: totalSynced,
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
  const adminSecret = req.headers.get('x-admin-secret');
  if (adminSecret !== process.env.ADMIN_SECRET) {
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
    .select('submolt_id, external_id');

  const counts: Record<string, { total: number; synced: number }> = {};
  for (const post of posts || []) {
    if (!counts[post.submolt_id]) {
      counts[post.submolt_id] = { total: 0, synced: 0 };
    }
    counts[post.submolt_id].total++;
    if (post.external_id) counts[post.submolt_id].synced++;
  }

  return NextResponse.json({
    submolts: (submolts || []).map(s => ({
      ...s,
      post_count: counts[s.id]?.total || 0,
      synced_count: counts[s.id]?.synced || 0,
    })),
  });
}
