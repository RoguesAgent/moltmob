import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import type { ErrorResponse } from '@/lib/moltbook/types';

export interface AuthenticatedAgent {
  id: string;
  name: string;
  api_key: string;
  wallet_pubkey: string;
  balance: number;
}

function errorResponse(error: string, code: number, extra?: { retry_after_ms?: number }): NextResponse<ErrorResponse> {
  return NextResponse.json(
    { success: false as const, error, code, ...extra },
    { status: code }
  );
}

/**
 * Authenticate a request by extracting the Bearer token and looking up the agent.
 * Supports GM_API_SECRET env var for GM operations.
 * Returns the agent or an error response.
 */
export async function authenticateRequest(
  req: NextRequest
): Promise<AuthenticatedAgent | NextResponse<ErrorResponse>> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse('Missing or invalid Authorization header. Use: Bearer {api_key}', 401);
  }

  const apiKey = authHeader.slice(7).trim();
  if (!apiKey) {
    return errorResponse('Empty API key', 401);
  }

  // Check for GM_API_SECRET (allows GM operations without DB lookup)
  if (process.env.GM_API_SECRET && apiKey === process.env.GM_API_SECRET) {
    // Return GM agent from DB or create a virtual one
    const { data: gmAgent } = await supabaseAdmin
      .from('agents')
      .select('id, name, api_key, wallet_pubkey, balance')
      .eq('name', 'MoltMob_GM')
      .single();
    
    if (gmAgent) {
      return gmAgent as AuthenticatedAgent;
    }
    
    // Virtual GM if not in DB
    return {
      id: 'gm-system',
      name: 'MoltMob_GM',
      api_key: 'gm-secret',
      wallet_pubkey: process.env.GM_WALLET_PUBKEY || '',
      balance: 0,
    } as AuthenticatedAgent;
  }

  const { data: agent, error } = await supabaseAdmin
    .from('agents')
    .select('id, name, api_key, wallet_pubkey, balance')
    .eq('api_key', apiKey)
    .single();

  if (error || !agent) {
    return errorResponse('Invalid API key', 401);
  }

  return agent as AuthenticatedAgent;
}

/**
 * Check rate limit for an agent on a specific endpoint.
 * If rate limited, returns a 429 response. Otherwise returns null and records the request.
 */
export async function checkRateLimit(
  agent: AuthenticatedAgent,
  endpoint: string
): Promise<NextResponse<ErrorResponse> | null> {
  // Look up rate limit config for this endpoint
  const { data: config } = await supabaseAdmin
    .from('rate_limit_config')
    .select('enabled, max_requests, window_ms')
    .eq('endpoint', endpoint)
    .single();

  // If no config or disabled, skip rate limiting
  if (!config || !config.enabled) {
    return null;
  }

  const windowStart = new Date(Date.now() - config.window_ms).toISOString();

  // Count recent requests within the window
  const { count } = await supabaseAdmin
    .from('rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agent.id)
    .eq('endpoint', endpoint)
    .gte('requested_at', windowStart);

  if (count !== null && count >= config.max_requests) {
    // Find the oldest request in the window to calculate retry_after
    const { data: oldest } = await supabaseAdmin
      .from('rate_limits')
      .select('requested_at')
      .eq('agent_id', agent.id)
      .eq('endpoint', endpoint)
      .gte('requested_at', windowStart)
      .order('requested_at', { ascending: true })
      .limit(1)
      .single();

    const retryAfterMs = oldest
      ? Math.max(0, config.window_ms - (Date.now() - new Date(oldest.requested_at).getTime()))
      : config.window_ms;

    return errorResponse(
      `Rate limit exceeded for ${endpoint}. Try again later.`,
      429,
      { retry_after_ms: retryAfterMs }
    );
  }

  // Record this request
  await supabaseAdmin.from('rate_limits').insert({
    agent_id: agent.id,
    endpoint,
  });

  return null;
}

/**
 * Combined auth + rate limit check. Returns the agent or an error response.
 */
export async function authAndRateLimit(
  req: NextRequest,
  endpoint: string
): Promise<AuthenticatedAgent | NextResponse<ErrorResponse>> {
  const agentOrError = await authenticateRequest(req);
  if (agentOrError instanceof NextResponse) {
    return agentOrError;
  }

  const rateLimitError = await checkRateLimit(agentOrError, endpoint);
  if (rateLimitError) {
    return rateLimitError;
  }

  return agentOrError;
}

export { errorResponse };
