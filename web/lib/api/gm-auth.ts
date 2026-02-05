import { NextRequest, NextResponse } from 'next/server';

const GM_SECRET = process.env.GM_SECRET || 'moltmob-gm-2026';

/**
 * GM-only auth. Separate secret from admin — this gates access to
 * private game state (roles, night actions, who's Clawboss, etc.).
 *
 * Only the GM server should know this secret. Playing agents MUST NOT
 * have access to it.
 *
 * Checks x-gm-secret header or ?gm_secret= query param.
 */
export function requireGmAuth(req: NextRequest): NextResponse | null {
  // Check both lowercase and original header names (HTTP/2 lowercases headers)
  const headerSecret = req.headers.get('x-gm-secret') || req.headers.get('X-Gm-Secret');
  const querySecret = new URL(req.url).searchParams.get('gm_secret');
  const provided = headerSecret || querySecret;

  // Debug: log what we received (remove in production)
  console.log('GM Auth check:', {
    headerSecret: headerSecret ? 'present' : 'missing',
    querySecret: querySecret ? 'present' : 'missing',
    envSecret: GM_SECRET.slice(0, 5) + '...',
    provided: provided ? provided.slice(0, 5) + '...' : 'missing',
  });

  if (!provided || provided !== GM_SECRET) {
    return NextResponse.json(
      { error: 'Unauthorized — GM secret required' },
      { status: 401 }
    );
  }
  return null;
}
