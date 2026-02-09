// DEBUG: Find ALL required (NOT NULL) columns for gm_events
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/api/admin-auth';
import { randomUUID } from 'crypto';

export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  const testId = randomUUID();
  const columnsToTest = [
    'id', 'pod_id', 'event_type', 'summary', 'round', 'phase', 'details', 'created_at'
  ];
  
  const results: Record<string, { required: boolean; error?: string }> = {};
  
  // Start with empty object and add one column at a time
  let testPayload: any = { id: testId };
  
  for (const col of columnsToTest) {
    if (col === 'pod_id') testPayload[col] = testId;
    else if (col === 'event_type') testPayload[col] = 'test';
    else if (col === 'round') testPayload[col] = 1;
    else if (col === 'phase') testPayload[col] = 'test';
    else if (col === 'summary') testPayload[col] = 'test summary';
    else if (col === 'details') testPayload[col] = {};
    else if (col === 'created_at') testPayload[col] = new Date().toISOString();
    
    const { error } = await supabaseAdmin.from('gm_events').insert(testPayload);
    
    results[col] = {
      required: !!error && error.message?.includes('not-null'),
      error: error?.message,
    };
    
    // Clean up if success
    if (!error) {
      await supabaseAdmin.from('gm_events').delete().eq('id', testId);
    }
  }

  return NextResponse.json({ requiredColumns: results });
}
