// One-time migration endpoint - run schema migrations
// DELETE THIS FILE AFTER RUNNING
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const apiKey = authHeader?.replace('Bearer ', '');
  
  if (apiKey !== process.env.GM_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Direct database connection for DDL operations
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  
  const supabase = createClient(supabaseUrl, supabaseKey, {
    db: { schema: 'public' }
  });

  const migrations = [
    // Add pod_id to posts
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS pod_id uuid`,
    // Add moltbook_post_id to game_pods  
    `ALTER TABLE game_pods ADD COLUMN IF NOT EXISTS moltbook_post_id text`,
  ];

  const results: any[] = [];
  
  for (const sql of migrations) {
    try {
      // Use raw SQL via rpc if available, otherwise try direct
      const { data, error } = await supabase.rpc('exec_sql', { query: sql });
      results.push({ sql: sql.slice(0, 50) + '...', success: !error, error: error?.message });
    } catch (e: any) {
      results.push({ sql: sql.slice(0, 50) + '...', success: false, error: e.message });
    }
  }

  // Test if columns exist now
  const { error: postErr } = await supabase.from('posts').select('pod_id').limit(1);
  const { error: podErr } = await supabase.from('game_pods').select('moltbook_post_id').limit(1);

  return NextResponse.json({
    migrations: results,
    verification: {
      'posts.pod_id': postErr ? 'Missing' : 'OK',
      'game_pods.moltbook_post_id': podErr ? 'Missing' : 'OK',
    },
    note: 'If columns still missing, run SQL manually in Supabase Dashboard'
  });
}
