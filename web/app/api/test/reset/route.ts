import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireGmAuth } from '@/lib/api/gm-auth';

// POST /api/test/reset — clear all test data
// Only works if the tables have test data (checks for test_ prefix in agent names)
export async function POST(req: NextRequest) {
  const authError = requireGmAuth(req);
  if (authError) return authError;

  // Delete game data (cascades to players, actions, transactions, events)
  const { count: podCount } = await supabaseAdmin
    .from('game_pods')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // delete all
    .select('id', { count: 'exact', head: true });

  // Delete test agents (those with test_ prefix API keys)
  const { count: agentCount } = await supabaseAdmin
    .from('agents')
    .delete()
    .like('api_key', 'test_%')
    .select('id', { count: 'exact', head: true });

  return NextResponse.json({
    success: true,
    deleted: {
      pods: podCount ?? 0,
      test_agents: agentCount ?? 0,
    },
    message: 'Test data cleared',
  });
}
