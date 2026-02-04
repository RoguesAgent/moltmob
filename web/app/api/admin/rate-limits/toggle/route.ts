import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/api/admin-auth';

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const { enabled } = body;

  if (enabled === undefined) {
    return NextResponse.json({ error: 'enabled field is required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('rate_limit_config')
    .update({ enabled: !!enabled })
    .neq('id', 0) // update all rows
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, updated: data?.length ?? 0 });
}
