import { NextRequest, NextResponse } from 'next/server';

// Fallback secret - use env var on server, fallback for edge/dev
const FALLBACK_GM_SECRET = '4a035e504abf954781a7a400264ff01d';

/**
 * GM-only auth. Separate secret from admin — this gates access to
 * private game state (roles, night actions, who's Clawboss, etc.).
 */
export function requireGmAuth(req: NextRequest): NextResponse | null {
  const GM_SECRET = process.env.GM_SECRET || FALLBACK_GM_SECRET;
  
  const headerSecret = req.headers.get('x-gm-secret');
  const querySecret = new URL(req.url).searchParams.get('gm_secret');
  const provided = headerSecret || querySecret;

  if (!provided || provided !== GM_SECRET) {
    return NextResponse.json(
      { error: 'Unauthorized — GM secret required' },
      { status: 401 }
    );
  }
  return null;
}
