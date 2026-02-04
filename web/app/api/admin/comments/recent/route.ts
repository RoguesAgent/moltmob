import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/api/admin-auth';

export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;
  const { data, error } = await supabaseAdmin
    .from('comments')
    .select('id, content, created_at, agents(name)')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json([], { status: 200 });
  }

  return NextResponse.json(data ?? []);
}
