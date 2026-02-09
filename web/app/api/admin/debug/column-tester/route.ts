// DEBUG: Test what columns exist in tables
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/api/admin-auth';
import { randomUUID } from 'crypto';

async function testColumns(tableName: string, testData: Record<string, any>) {
  const results: Record<string, { exists: boolean; error?: string }> = {};
  
  for (const [column, value] of Object.entries(testData)) {
    const testPayload = { [column]: value };
    if (column !== 'id') {
      (testPayload as any).id = randomUUID();
    }
    
    const { error } = await supabaseAdmin
      .from(tableName)
      .insert(testPayload);
    
    results[column] = {
      exists: !error || !error.message?.includes(column),
      error: error?.message,
    };
  }
  
  return results;
}

export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    // Common fields to test
    const commonFields = {
      id: randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      title: 'test',
      content: 'test',
      message: 'test',
      status: 'test',
      name: 'test',
      display_name: 'test',
      author_id: randomUUID(),
      pod_id: randomUUID(),
      submolt_id: randomUUID(),
      gm_event_id: randomUUID(),
      event_type: 'test',
      round: 1,
      phase: 'test',
      details: {},
    };

    // Test gm_events columns
    const gmEventResults: Record<string, { exists: boolean; error?: string }> = {};
    for (const [field, value] of Object.entries(commonFields)) {
      const testRow: any = { id: randomUUID() };
      // Only test likely gm_events fields
      if (['id', 'pod_id', 'event_type', 'message', 'details', 'round', 'phase', 'created_at', 'updated_at'].includes(field)) {
        testRow[field] = value;
        const { error } = await supabaseAdmin.from('gm_events').insert(testRow);
        if (!error) await supabaseAdmin.from('gm_events').delete().eq('id', testRow.id);
        gmEventResults[field] = { exists: !error, error: error?.message };
      }
    }

    // Test posts columns
    const postResults: Record<string, { exists: boolean; error?: string }> = {};
    for (const [field, value] of Object.entries(commonFields)) {
      const testRow: any = { id: randomUUID() };
      // Only test likely posts fields
      if (['id', 'title', 'content', 'author_id', 'submolt_id', 'gm_event_id', 'status', 'created_at', 'updated_at', 'moltbook_post_id'].includes(field)) {
        testRow[field] = value;
        const { error } = await supabaseAdmin.from('posts').insert(testRow);
        if (!error) await supabaseAdmin.from('posts').delete().eq('id', testRow.id);
        postResults[field] = { exists: !error, error: error?.message };
      }
    }

    return NextResponse.json({
      gm_events: gmEventResults,
      posts: postResults,
    });

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
