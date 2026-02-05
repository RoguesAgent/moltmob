import { NextRequest, NextResponse } from 'next/server';

// Fallback for edge runtime where process.env is not available
const GM_SECRET = 'moltmob-gm-2026';

/**
 * GM-only auth. Separate secret from admin.
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
