/**
 * GM Players API — Get players with roles (GM access only)
 * Unlike public API, this includes role information
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const GM_SECRET = process.env.GM_API_SECRET;

function verifyGmSecret(req: NextRequest): boolean {
  const secret = req.headers.get('x-gm-secret') || 
                 req.headers.get('authorization')?.replace('Bearer ', '');
  return !!GM_SECRET && secret === GM_SECRET;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyGmSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id: podId } = await params;

    // Get pod first to verify it exists
    const { data: pod, error: podError } = await supabaseAdmin
      .from('game_pods')
      .select('id, status')
      .eq('id', podId)
      .single();

    if (podError || !pod) {
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }

    // Get players WITH role (GM only)
    const { data: players, error: playersError } = await supabaseAdmin
      .from('game_players')
      .select('agent_id, agent_name, wallet_pubkey, role, status, eliminated_by, eliminated_round, has_acted_this_phase')
      .eq('pod_id', podId);

    if (playersError) {
      return NextResponse.json({ error: playersError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      pod_id: podId,
      players: players || [] 
    });
  } catch (err) {
    return NextResponse.json({ 
      error: err instanceof Error ? err.message : 'Unknown error' 
    }, { status: 500 });
  }
}
