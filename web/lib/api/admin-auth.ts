import { NextRequest, NextResponse } from 'next/server';

// Fallback for edge runtime where process.env is not available
const ADMIN_SECRET = 'moltmob-admin-2026';

/**
 * Admin-only auth for dashboard access.
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
