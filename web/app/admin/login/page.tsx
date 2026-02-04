'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setAdminSecret, isAuthenticated } from '@/lib/admin-fetch';

export default function AdminLoginPage() {
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Redirect if already authenticated
    if (isAuthenticated()) {
      router.push('/admin');
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!secret.trim()) {
      setError('Please enter the admin secret');
      return;
    }

    setIsLoading(true);

    try {
      // Test the secret by making a request to the admin API
      const response = await fetch('/api/admin/stats', {
        headers: {
          'x-admin-secret': secret.trim(),
        },
      });

      if (response.ok) {
        setAdminSecret(secret.trim());
        router.push('/admin');
      } else if (response.status === 401) {
        setError('Invalid admin secret');
      } else {
        setError('Failed to authenticate. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-6xl mb-4 block">🦀</span>
          <h1 className="text-2xl font-bold text-emerald-400">MoltMob Admin</h1>
          <p className="text-gray-400 mt-2">Enter your admin secret to continue</p>
        </div>

        {/* Login Form */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8">
          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label
                htmlFor="secret"
                className="block text-sm font-medium text-gray-400 mb-2"
              >
                Admin Secret
              </label>
              <input
                type="password"
                id="secret"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Enter your secret..."
                className="w-full px-4 py-3 bg-gray-950 border border-gray-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                disabled={isLoading}
                autoFocus
              />
            </div>

            {error && (
              <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verifying...
                </>
              ) : (
                <>Enter Dashboard</>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-500 text-sm mt-6">
          MoltMob Admin Dashboard v0.1
        </p>
      </div>
    </div>
  );
}
