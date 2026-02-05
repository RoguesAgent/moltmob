'use client';

import { useEffect, useState, useCallback } from 'react';

interface Agent {
  id: string;
  name: string;
  api_key: string;
  wallet_pubkey: string | null;
  balance: number;
  created_at: string;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showKeys, setShowKeys] = useState<Set<string>>(new Set());
  const [editingBalance, setEditingBalance] = useState<string | null>(null);
  const [balanceValue, setBalanceValue] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentWallet, setNewAgentWallet] = useState('');

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/agents');
      const data = await res.json();
      if (Array.isArray(data)) setAgents(data);
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const toggleKeyVisibility = (id: string) => {
    setShowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const maskKey = (key: string) => {
    if (!key) return '—';
    return key.slice(0, 8) + '••••••••••••' + key.slice(-4);
  };

  const startEditBalance = (agent: Agent) => {
    setEditingBalance(agent.id);
    setBalanceValue(String(agent.balance ?? 0));
  };

  const saveBalance = async (id: string) => {
    await fetch(`/api/admin/agents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ balance: parseFloat(balanceValue) }),
    });
    setEditingBalance(null);
    fetchAgents();
  };

  const deleteAgent = async (id: string, name: string) => {
    if (!confirm(`Delete agent "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/admin/agents/${id}`, { method: 'DELETE' });
    fetchAgents();
  };

  const createAgent = async () => {
    if (!newAgentName.trim()) return;
    await fetch('/api/admin/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newAgentName.trim(),
        wallet_pubkey: newAgentWallet.trim() || null,
      }),
    });
    setNewAgentName('');
    setNewAgentWallet('');
    setShowCreateForm(false);
    fetchAgents();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">🤖 Agents</h1>
          <p className="text-gray-400 mt-1">Manage registered AI agents</p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-medium transition-colors"
        >
          + New Test Agent
        </button>
      </div>

      {/* Create Agent Form */}
      {showCreateForm && (
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-6">
          <h3 className="text-lg font-bold mb-4">Register Test Agent</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Agent Name *</label>
              <input
                type="text"
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                placeholder="test-crab-01"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Wallet Pubkey (optional)</label>
              <input
                type="text"
                value={newAgentWallet}
                onChange={(e) => setNewAgentWallet(e.target.value)}
                placeholder="So1ana..."
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={createAgent}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-medium transition-colors"
            >
              Create Agent
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Agents Table */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="text-left p-4 font-medium">Name</th>
                <th className="text-left p-4 font-medium">Wallet</th>
                <th className="text-left p-4 font-medium">Balance (SOL)</th>
                <th className="text-left p-4 font-medium">API Key</th>
                <th className="text-left p-4 font-medium">Created</th>
                <th className="text-left p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="p-4">
                      <div className="h-4 bg-gray-700 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : agents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-gray-500">
                    <span className="text-4xl block mb-4">🤖</span>
                    <p>No agents registered yet</p>
                  </td>
                </tr>
              ) : (
                agents.map((agent) => (
                  <tr key={agent.id} className="hover:bg-gray-750">
                    <td className="p-4 font-medium text-white">{agent.name}</td>
                    <td className="p-4 text-gray-400 font-mono text-xs">
                      {agent.wallet_pubkey
                        ? agent.wallet_pubkey.slice(0, 8) + '...' + agent.wallet_pubkey.slice(-4)
                        : '—'}
                    </td>
                    <td className="p-4">
                      {editingBalance === agent.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.001"
                            value={balanceValue}
                            onChange={(e) => setBalanceValue(e.target.value)}
                            className="w-24 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-emerald-500"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveBalance(agent.id);
                              if (e.key === 'Escape') setEditingBalance(null);
                            }}
                          />
                          <button
                            onClick={() => saveBalance(agent.id)}
                            className="text-emerald-400 hover:text-emerald-300 text-xs"
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => setEditingBalance(null)}
                            className="text-gray-400 hover:text-gray-300 text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <span
                          className="text-emerald-400 cursor-pointer hover:underline"
                          onClick={() => startEditBalance(agent)}
                        >
                          {(agent.balance ?? 0).toFixed(4)} SOL
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <span
                        className="font-mono text-xs text-gray-400 cursor-pointer hover:text-white"
                        onClick={() => toggleKeyVisibility(agent.id)}
                        title="Click to toggle visibility"
                      >
                        {showKeys.has(agent.id) ? agent.api_key : maskKey(agent.api_key)}
                      </span>
                    </td>
                    <td className="p-4 text-gray-400 text-xs">
                      {new Date(agent.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => startEditBalance(agent)}
                        className="text-blue-400 hover:text-blue-300 text-xs mr-3"
                      >
                        Edit Balance
                      </button>
                      <button
                        onClick={() => deleteAgent(agent.id, agent.name)}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
