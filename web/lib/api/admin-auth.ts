import { NextRequest, NextResponse } from 'next/server';

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'moltmob-admin-2026';

/**
 * Check admin auth via x-admin-secret header or ?secret= query param.
 * Returns null if authorized, or a 401 NextResponse if not.
 */
export function requireAdminAuth(req: NextRequest): NextResponse | null {
  const headerSecret = req.headers.get('x-admin-secret');
  const querySecret = new URL(req.url).searchParams.get('secret');
  const provided = headerSecret || querySecret;

  if (!provided || provided !== ADMIN_SECRET) {
    return NextResponse.json(
      { error: 'Unauthorized — provide x-admin-secret header or ?secret= param' },
      { status: 401 }
    );
  }

  return null; // authorized
}
