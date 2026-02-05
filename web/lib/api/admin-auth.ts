import { NextRequest, NextResponse } from 'next/server';

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'moltmob-admin-2026';

/**
 * Admin-only auth for dashboard access.
 * Checks x-admin-secret header or ?admin_secret= query param.
 */
export function requireAdminAuth(req: NextRequest): NextResponse | null {
  const headerSecret = req.headers.get('x-admin-secret');
  const querySecret = new URL(req.url).searchParams.get('admin_secret');
  const provided = headerSecret || querySecret;

  if (!provided || provided !== ADMIN_SECRET) {
    return NextResponse.json(
      { error: 'Unauthorized — Admin secret required' },
      { status: 401 }
    );
  }
  return null;
}
