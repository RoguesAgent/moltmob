import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminAuth } from '@/lib/api/admin-auth';

export async function GET(req: NextRequest) {
  const authError = requireAdminAuth(req);
  if (authError) return authError;
  // Get recent rate limit entries (last hour) grouped by agent and endpoint
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('rate_limits')
    .select('agent_id, endpoint, agents(name)')
    .gte('requested_at', oneHourAgo);

  if (error || !data) {
    return NextResponse.json([]);
  }

  // Group by agent + endpoint
  const grouped: Record<string, { agent_id: string; agent_name: string; endpoint: string; count: number }> = {};

  for (const entry of data) {
    const key = `${entry.agent_id}-${entry.endpoint}`;
    if (!grouped[key]) {
      grouped[key] = {
        agent_id: entry.agent_id,
        agent_name: (entry.agents as Record<string, unknown>)?.name as string || 'Unknown',
        endpoint: entry.endpoint,
        count: 0,
      };
    }
    grouped[key].count++;
  }

  return NextResponse.json(Object.values(grouped));
}
