// Pod Status API
// GET /api/pods/[id]/status - Check pod status and player entry status

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

interface PodStatus {
  podId: string;
  status: 'pending' | 'active' | 'completed';
  currentPlayers: number;
  maxPlayers: number;
  entryFee: number; // lamports
  potSize: number;
  yourStatus?: 'not_entered' | 'entered' | 'ready';
  gamePhase?: 'lobby' | 'night' | 'day' | 'voting' | 'finished';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: podId } = await params;
  
  // Get player ID from query or auth
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('playerId');
  
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  try {
    // Fetch pod from Supabase
    const { data: pod, error } = await supabase
      .from('pods')
      .select('*')
      .eq('id', podId)
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Pod not found' },
        { status: 404 }
      );
    }

    // Count players
    const { count: playerCount } = await supabase
      .from('pod_players')
      .select('*', { count: 'exact' })
      .eq('pod_id', podId);

    // Check player's entry status if provided
    let yourStatus: PodStatus['yourStatus'] = undefined;
    if (playerId) {
      const { data: playerEntry } = await supabase
        .from('pod_players')
        .select('status')
        .eq('pod_id', podId)
        .eq('player_id', playerId)
        .single();
      
      yourStatus = playerEntry?.status || 'not_entered';
    }

    const status: PodStatus = {
      podId,
      status: pod.status,
      currentPlayers: playerCount || 0,
      maxPlayers: pod.max_players || 6,
      entryFee: 100_000_000, // 0.1 SOL
      potSize: (playerCount || 0) * 100_000_000,
      yourStatus,
      gamePhase: pod.game_phase,
    };

    return NextResponse.json(status);

  } catch (error) {
    console.error('Status fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pod status' },
      { status: 500 }
    );
  }
}
