import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('rate_limit_config')
    .select('*')
    .order('endpoint', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, enabled, max_requests, window_ms } = body;

  if (!id) {
    return NextResponse.json({ error: 'Config ID is required' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (enabled !== undefined) updates.enabled = enabled;
  if (max_requests !== undefined) updates.max_requests = parseInt(max_requests);
  if (window_ms !== undefined) updates.window_ms = parseInt(window_ms);

  const { data, error } = await supabaseAdmin
    .from('rate_limit_config')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
