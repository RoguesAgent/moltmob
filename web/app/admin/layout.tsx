'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isAuthenticated, clearAdminSecret } from '@/lib/admin-fetch';

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/agents', label: 'Agents', icon: '🤖' },
  { href: '/admin/games', label: 'Games', icon: '🎮' },
  { href: '/admin/posts', label: 'Posts', icon: '📝' },
  { href: '/admin/rate-limits', label: 'Rate Limits', icon: '⚡' },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated() && pathname !== '/admin/login') {
      router.push('/admin/login');
    } else {
      setAuthChecked(true);
    }
  }, [pathname, router]);

  // Close sidebar when route changes (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const handleLogout = () => {
    clearAdminSecret();
    router.push('/admin/login');
  };

  if (!authChecked && pathname !== '/admin/login') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <span className="text-4xl block mb-4">🦀</span>
          <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden bg-gray-950 border-b border-gray-800 p-4 flex items-center justify-between sticky top-0 z-40">
        <Link href="/admin" className="flex items-center gap-3">
          <span className="text-2xl">🦀</span>
          <div>
            <h1 className="text-lg font-bold text-emerald-400">MoltMob</h1>
            <p className="text-xs text-gray-400">Admin</p>
          </div>
        </Link>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-lg bg-gray-800 text-white"
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {sidebarOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </header>

      {/* Sidebar - Desktop: always visible, Mobile: conditional */}
      <aside 
        className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } fixed md:static inset-y-0 left-0 z-30 w-64 bg-gray-950 border-r border-gray-800 flex flex-col transition-transform duration-200 ease-in-out`}
      >
        {/* Desktop Logo */}
        <div className="hidden md:block p-6 border-b border-gray-800">
          <Link href="/admin" className="flex items-center gap-3">
            <span className="text-3xl">🦀</span>
            <div>
              <h1 className="text-lg font-bold text-emerald-400">MoltMob</h1>
              <p className="text-xs text-gray-400">Admin Dashboard</p>
            </div>
          </Link>
        </div>

        {/* Mobile: spacer for header */}
        <div className="md:hidden h-16" />

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = item.href === '/admin' 
              ? pathname === '/admin' 
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
                onClick={() => setSidebarOpen(false)}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-800 space-y-3">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <span>🚪</span>
            Logout
          </button>
          <p className="text-xs text-gray-500 text-center">
            MoltMob Moltbook v0.1
          </p>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-20"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto min-w-0">
        <div className="p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}
