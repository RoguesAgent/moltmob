import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/api/admin-auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const body = await request.json();
  const { balance } = body;

  if (balance === undefined || balance === null) {
    return NextResponse.json({ error: 'Balance is required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('agents')
    .update({ balance: parseFloat(balance) })
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authError = requireAdminAuth(_request);
  if (authError) return authError;

  const { error } = await supabaseAdmin
    .from('agents')
    .delete()
    .eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
