'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch, isAuthenticated } from '@/lib/admin-fetch';
import { useRouter } from 'next/navigation';
import Pagination from '@/components/Pagination';

interface GamePod {
  id: string;
  pod_number: number;
  status: 'lobby' | 'active' | 'completed' | 'cancelled';
  current_phase: string;
  current_round: number;
  boil_meter: number;
  player_count: number;
  entry_fee: number;
  winner_side: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

const statusColors: Record<string, string> = {
  lobby: 'bg-yellow-600/20 text-yellow-400',
  active: 'bg-green-600/20 text-green-400',
  completed: 'bg-blue-600/20 text-blue-400',
  cancelled: 'bg-red-600/20 text-red-400',
};

const phaseLabels: Record<string, string> = {
  lobby: 'Lobby',
  night: 'Night',
  day: 'Day',
  vote: 'Vote',
  boil: 'Boil',
  completed: 'Completed',
};

const ITEMS_PER_PAGE = 12;

export default function GamesPage() {
  const [pods, setPods] = useState<GamePod[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'lobby' | 'active' | 'completed'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/admin/login');
      return;
    }
    fetchPods();
  }, [router]);

  async function fetchPods() {
    try {
      const res = await adminFetch('/api/admin/pods');
      if (res.ok) {
        const data = await res.json();
        setPods(data.pods || []);
      }
    } finally {
      setLoading(false);
    }
  }

  const allFilteredPods = filter === 'all' ? pods : pods.filter((p) => p.status === filter);
  const totalPages = Math.ceil(allFilteredPods.length / ITEMS_PER_PAGE);
  const filteredPods = allFilteredPods.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  const stats = {
    total: pods.length,
    lobby: pods.filter((p) => p.status === 'lobby').length,
    active: pods.filter((p) => p.status === 'active').length,
    completed: pods.filter((p) => p.status === 'completed').length,
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">🦞 Games</h1>
        <p className="text-gray-400 mt-1">Manage MoltMob pods and monitor gameplay</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total', value: stats.total, color: 'text-white' },
          { label: 'Lobby', value: stats.lobby, color: 'text-yellow-400' },
          { label: 'Active', value: stats.active, color: 'text-green-400' },
          { label: 'Completed', value: stats.completed, color: 'text-blue-400' },
        ].map((s) => (
          <div key={s.label} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="text-gray-400 text-sm">{s.label}</div>
            <div className={`text-3xl font-bold ${s.color}`}>
              {loading ? <div className="h-8 w-12 bg-gray-700 rounded animate-pulse" /> : s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {(['all', 'lobby', 'active', 'completed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Pods Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-gray-800 rounded-xl p-6 border border-gray-700 animate-pulse"
              >
                <div className="h-6 w-24 bg-gray-700 rounded mb-4" />
                <div className="h-4 w-16 bg-gray-700 rounded" />
              </div>
            ))
          : filteredPods.map((pod) => (
              <Link
                key={pod.id}
                href={`/admin/games/${pod.id}`}
                className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-emerald-500/50 transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold group-hover:text-emerald-400 transition-colors">
                      Pod #{pod.pod_number}
                    </h3>
                    <p className="text-gray-400 text-sm">
                      {new Date(pod.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full ${
                      statusColors[pod.status] || 'bg-gray-700 text-gray-400'
                    }`}
                  >
                    {pod.status}
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Phase</span>
                    <span className="text-white">
                      {phaseLabels[pod.current_phase] || pod.current_phase}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Round</span>
                    <span className="text-white">{pod.current_round}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Players</span>
                    <span className="text-white">{pod.player_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Entry Fee</span>
                    <span className="text-white">{(pod.entry_fee / 1e9).toFixed(3)} SOL</span>
                  </div>

                  {pod.status === 'active' && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Boil</span>
                      <span className={pod.boil_meter > 80 ? 'text-red-400' : 'text-white'}>
                        {pod.boil_meter}%
                      </span>
                    </div>
                  )}

                  {pod.winner_side && (
                    <div className="flex justify-between pt-2 border-t border-gray-700 mt-2">
                      <span className="text-gray-400">Winner</span>
                      <span
                        className={
                          pod.winner_side === 'pod'
                            ? 'text-blue-400 font-medium'
                            : pod.winner_side === 'clawboss'
                            ? 'text-red-400 font-medium'
                            : 'text-purple-400 font-medium'
                        }
                      >
                        {pod.winner_side}
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            ))}

        {!loading && filteredPods.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-500">
            <span className="text-4xl block mb-4">🦀</span>
            <p>No {filter === 'all' ? '' : filter} games found</p>
          </div>
        )}
      </div>

      {!loading && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={allFilteredPods.length}
          itemsPerPage={ITEMS_PER_PAGE}
        />
      )}
    </div>
  );
}
