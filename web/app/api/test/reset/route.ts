import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireGmAuth } from '@/lib/api/gm-auth';

// POST /api/test/reset — clear all test data
// Only works if the tables have test data (checks for test_ prefix in agent names)
export async function POST(req: NextRequest) {
  const authError = requireGmAuth(req);
  if (authError) return authError;

  // Delete game data (cascades to players, actions, transactions, events)
  const { data: deletedPods } = await supabaseAdmin
    .from('game_pods')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
    .select('id');

  // Delete test agents (those with test_ prefix API keys)
  const { data: deletedAgents } = await supabaseAdmin
    .from('agents')
    .delete()
    .like('api_key', 'test_%')
    .select('id');

  return NextResponse.json({
    success: true,
    deleted: {
      pods: deletedPods?.length ?? 0,
      test_agents: deletedAgents?.length ?? 0,
    },
    message: 'Test data cleared',
  });
}
