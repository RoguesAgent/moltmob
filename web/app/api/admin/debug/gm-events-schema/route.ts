// DEBUG: Check gm_events schema
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/api/admin-auth';

export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  try {
    // Try inserting a test event
    const { error } = await supabaseAdmin
      .from('gm_events')
      .insert({
        id: 'test-' + Date.now(),
        pod_id: 'test-pod',
        event_type: 'test',
        message: 'Test event',
        round: 1,
        phase: 'test',
      });

    if (error) {
      return NextResponse.json({ 
        error: 'Insert failed', 
        details: error 
      }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
