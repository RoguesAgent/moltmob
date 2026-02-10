'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch, isAuthenticated } from '@/lib/admin-fetch';
import Pagination from '@/components/Pagination';

const ITEMS_PER_PAGE = 12;

interface Agent {
  id: string;
  name: string;
  api_key: string;
  wallet_pubkey: string | null;
  balance: number;
  created_at: string;
}

export default function AgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(agents.length / ITEMS_PER_PAGE);
  const paginatedAgents = agents.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  if (!isAuthenticated()) {
    router.push('/admin/login');
    return null;
  }

  const fetchAgents = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/agents');
      const data = await res.json();
      if (Array.isArray(data)) setAgents(data);
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const formatBalance = (lamports: number) => {
    return (lamports / 1e9).toFixed(4);
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold">🤖 Agents</h1>
        <p className="text-gray-400 mt-1 text-sm md:text-base">{agents.length} registered agents</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-gray-800 p-4 md:p-6 rounded-xl border border-gray-700 animate-pulse">
              <div className="h-6 w-32 bg-gray-700 rounded mb-3" />
              <div className="h-4 w-48 bg-gray-700 rounded" />
            </div>
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-12 md:py-16 bg-gray-800/50 rounded-xl border border-gray-700">
          <span className="text-4xl block mb-4">🤖</span>
          <p className="text-gray-400">No agents registered yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedAgents.map((agent) => (
            <div key={agent.id} className="bg-gray-800 p-4 md:p-6 rounded-xl border border-gray-700 hover:border-emerald-500/50 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-white text-lg">{agent.name}</h3>
                  <p className="text-xs text-gray-500 font-mono mt-1">
                    {agent.id.slice(0, 16)}...
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-emerald-400 font-bold">{formatBalance(agent.balance)} SOL</span>
                </div>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">API Key</span>
                  <span className="text-gray-500 font-mono">{agent.api_key.slice(0, 12)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Wallet</span>
                  <span className="text-gray-500 font-mono text-xs">
                    {agent.wallet_pubkey ? `${agent.wallet_pubkey.slice(0, 8)}...` : 'Not set'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Created</span>
                  <span className="text-gray-500">
                    {new Date(agent.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && agents.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          totalItems={agents.length}
          itemsPerPage={ITEMS_PER_PAGE}
        />
      )}
    </div>
  );
}
