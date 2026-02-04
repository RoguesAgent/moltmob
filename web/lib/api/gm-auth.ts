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
