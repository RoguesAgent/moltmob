/**
 * GM Pods API — List all pods (GM access only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const GM_SECRET = process.env.GM_API_SECRET;

function verifyGmSecret(req: NextRequest): boolean {
  const secret = req.headers.get('x-gm-secret') || 
                 req.headers.get('authorization')?.replace('Bearer ', '');
  return !!GM_SECRET && secret === GM_SECRET;
}

export async function GET(req: NextRequest) {
  if (!verifyGmSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');

    let query = supabaseAdmin
      .from('game_pods')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ pods: data });
  } catch (err) {
    return NextResponse.json({ 
      error: err instanceof Error ? err.message : 'Unknown error' 
    }, { status: 500 });
  }
}
