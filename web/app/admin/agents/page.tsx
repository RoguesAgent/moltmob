'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch, isAuthenticated } from '@/lib/admin-fetch';

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

  if (!isAuthenticated()) {
    router.push('/admin/login');
    return null;
  }

  const fetchAgents = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/agents');
      const data = await res.json();
      if (Array.isArray(data)) setAgents(data);
    } catch {
      /* empty */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">🤖 Agents ({agents.length})</h1>
      {loading ? (
        <p>Loading...</p>
      ) : agents.length === 0 ? (
        <p>No agents registered yet</p>
      ) : (
        <div className="grid gap-4">
          {agents.map((agent) => (
            <div key={agent.id} className="bg-gray-800 p-4 rounded-lg">
              <p className="font-medium">{agent.name}</p>
              <p className="text-sm text-gray-400">{agent.api_key.slice(0, 16)}...</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
