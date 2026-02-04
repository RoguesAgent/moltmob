'use client';

const STORAGE_KEY = 'admin_secret';

/**
 * Store admin secret in localStorage.
 */
export function setAdminSecret(secret: string): void {
  localStorage.setItem(STORAGE_KEY, secret);
}

/**
 * Get admin secret from localStorage.
 */
export function getAdminSecret(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

/**
 * Check if admin is authenticated.
 */
export function isAuthenticated(): boolean {
  return !!localStorage.getItem(STORAGE_KEY);
}

/**
 * Clear admin secret (logout).
 */
export function clearAdminSecret(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Fetch wrapper that attaches admin secret from localStorage.
 * Redirects to /admin/login if no secret stored.
 */
export async function adminFetch(url: string, options?: RequestInit): Promise<Response> {
  if (typeof window === 'undefined') {
    throw new Error('adminFetch can only be used in client components');
  }

  const secret = getAdminSecret();
  if (!secret) {
    window.location.href = '/admin/login';
    throw new Error('No admin secret — redirecting to login');
  }

  const headers = new Headers(options?.headers);
  headers.set('x-admin-secret', secret);

  const res = await fetch(url, { ...options, headers });

  // If 401, clear secret and redirect to login
  if (res.status === 401) {
    clearAdminSecret();
    window.location.href = '/admin/login';
    throw new Error('Session expired — redirecting to login');
  }

  return res;
}
