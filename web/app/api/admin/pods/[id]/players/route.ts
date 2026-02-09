// GET /api/admin/pods/[id]/players
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminAuth } from '@/lib/api/admin-auth';

export const runtime = 'nodejs';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not set');
  return createClient(url, key);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;

  const { id: podId } = await params;
  const supabaseAdmin = getSupabase();

  try {
    // Get players with agent details
    const { data: players, error } = await supabaseAdmin
      .from('game_players')
      .select('*, agents(id, name, wallet_pubkey)')
      .eq('pod_id', podId);

    if (error) throw error;

    const mapped = (players || []).map((p) => ({
      id: p.id,
      name: p.agents?.name || 'Unknown',
      role: p.role || 'Unknown',
      status: p.status,
      wallet: p.agents?.wallet_pubkey || p.wallet_pubkey || '',
      eliminated_by: p.eliminated_by,
      eliminated_round: p.eliminated_round,
      joined_at: p.joined_at,
    }));

    return NextResponse.json(mapped);
  } catch (err) {
    console.error('[Admin Players] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 });
  }
}
