import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireGmAuth } from '@/lib/api/gm-auth';

// GET /api/gm/pods — list all pods (GM sees everything)
export async function GET(req: NextRequest) {
  const authError = requireGmAuth(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  let query = supabaseAdmin
    .from('game_pods')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ pods: data || [] });
}

// POST /api/gm/pods — GM creates a new pod
export async function POST(req: NextRequest) {
  const authError = requireGmAuth(req);
  if (authError) return authError;

  const body = await req.json();

  const { data, error } = await supabaseAdmin
    .from('game_pods')
    .insert({
      pod_number: body.pod_number ?? 1,
      status: 'lobby',
      current_phase: 'lobby',
      entry_fee: body.entry_fee ?? 10_000_000,
      network_name: body.network_name ?? 'solana-devnet',
      token: body.token ?? 'WSOL',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ pod: data }, { status: 201 });
}
