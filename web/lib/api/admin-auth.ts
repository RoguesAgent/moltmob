import { NextRequest, NextResponse } from 'next/server';

// Admin secret from environment variable - no fallback for security
const ADMIN_SECRET = process.env.ADMIN_SECRET;

/**
 * Admin-only auth for dashboard access.
 */
export function requireAdminAuth(req: NextRequest): NextResponse | null {
  const headerSecret = req.headers.get('x-admin-secret');
  const querySecret = new URL(req.url).searchParams.get('admin_secret');
  const provided = headerSecret || querySecret;

  if (!ADMIN_SECRET) {
    return NextResponse.json(
      { error: 'Server error — Admin secret not configured' },
      { status: 500 }
    );
  }

  if (!provided || provided !== ADMIN_SECRET) {
    return NextResponse.json(
      { error: 'Unauthorized — Admin secret required' },
      { status: 401 }
    );
  }

  return null;
}
