'use client';

/**
 * Fetch wrapper that attaches admin secret from localStorage.
 * Redirects to /admin/login if no secret stored.
 */
export async function adminFetch(url: string, options?: RequestInit): Promise<Response> {
  if (typeof window === 'undefined') {
    throw new Error('adminFetch can only be used in client components');
  }

  const secret = localStorage.getItem('admin_secret');
  if (!secret) {
    window.location.href = '/admin/login';
    throw new Error('No admin secret — redirecting to login');
  }

  const headers = new Headers(options?.headers);
  headers.set('x-admin-secret', secret);

  return fetch(url, { ...options, headers });
}
