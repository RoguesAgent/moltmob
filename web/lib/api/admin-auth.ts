import { NextRequest, NextResponse } from 'next/server';

// Fallback secret - use env var on server, fallback for edge/dev
const FALLBACK_ADMIN_SECRET = '55c350d813b3a0430b91821059e25b63';

/**
 * Admin-only auth for dashboard access.
 */
export function requireAdminAuth(req: NextRequest): NextResponse | null {
  const ADMIN_SECRET = process.env.ADMIN_SECRET || FALLBACK_ADMIN_SECRET;
  
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
