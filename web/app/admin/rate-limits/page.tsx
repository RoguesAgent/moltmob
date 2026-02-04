'use client';

import { useEffect, useState, useCallback } from 'react';

interface RateLimitConfig {
  id: string;
  enabled: boolean;
  endpoint: string;
  max_requests: number;
  window_ms: number;
}

interface RateLimitUsage {
  agent_id: string;
  agent_name: string;
  endpoint: string;
  count: number;
}

export default function RateLimitsPage() {
  const [configs, setConfigs] = useState<RateLimitConfig[]>([]);
  const [usage, setUsage] = useState<RateLimitUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingConfig, setEditingConfig] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ max_requests: '', window_ms: '' });
  const [globalEnabled, setGlobalEnabled] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [configRes, usageRes] = await Promise.all([
        fetch('/api/admin/rate-limits'),
        fetch('/api/admin/rate-limits/usage'),
      ]);

      const configData = await configRes.json();
      if (Array.isArray(configData)) {
        setConfigs(configData);
        setGlobalEnabled(configData.some((c: RateLimitConfig) => c.enabled));
      }

      try {
        const usageData = await usageRes.json();
        if (Array.isArray(usageData)) setUsage(usageData);
      } catch { /* empty */ }
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleGlobal = async () => {
    const newState = !globalEnabled;
    await fetch('/api/admin/rate-limits/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: newState }),
    });
    setGlobalEnabled(newState);
    fetchData();
  };

  const toggleEndpoint = async (config: RateLimitConfig) => {
    await fetch('/api/admin/rate-limits', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: config.id, enabled: !config.enabled }),
    });
    fetchData();
  };

  const startEdit = (config: RateLimitConfig) => {
    setEditingConfig(config.id);
    setEditValues({
      max_requests: String(config.max_requests),
      window_ms: String(config.window_ms),
    });
  };

  const saveEdit = async (id: string) => {
    await fetch('/api/admin/rate-limits', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        max_requests: parseInt(editValues.max_requests),
        window_ms: parseInt(editValues.window_ms),
      }),
    });
    setEditingConfig(null);
    fetchData();
  };

  const formatWindowMs = (ms: number) => {
    if (ms >= 3600000) return `${(ms / 3600000).toFixed(1)}h`;
    if (ms >= 60000) return `${(ms / 60000).toFixed(0)}m`;
    return `${(ms / 1000).toFixed(0)}s`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">⚡ Rate Limits</h1>
          <p className="text-gray-400 mt-1">Configure API rate limiting per endpoint</p>
        </div>

        {/* Master Toggle */}
        <button
          onClick={toggleGlobal}
          className={`flex items-center gap-3 px-6 py-3 rounded-xl font-medium text-sm transition-all ${
            globalEnabled
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-red-600/20 text-red-400 border border-red-500/30'
          }`}
        >
          <span
            className={`w-3 h-3 rounded-full ${
              globalEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
            }`}
          />
          Rate Limiting: {globalEnabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Rate Limit Configs */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden mb-8">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold">Endpoint Configuration</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="text-left p-4 font-medium">Status</th>
                <th className="text-left p-4 font-medium">Endpoint</th>
                <th className="text-left p-4 font-medium">Max Requests</th>
                <th className="text-left p-4 font-medium">Window</th>
                <th className="text-left p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="p-4">
                      <div className="h-4 bg-gray-700 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : configs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-gray-500">
                    <span className="text-4xl block mb-4">⚡</span>
                    <p>No rate limit configs found</p>
                  </td>
                </tr>
              ) : (
                configs.map((config) => (
                  <tr key={config.id} className="hover:bg-gray-750">
                    <td className="p-4">
                      <button
                        onClick={() => toggleEndpoint(config)}
                        className={`w-12 h-6 rounded-full relative transition-colors ${
                          config.enabled ? 'bg-emerald-600' : 'bg-gray-600'
                        }`}
                      >
                        <span
                          className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                            config.enabled ? 'left-7' : 'left-1'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="p-4 font-mono text-emerald-400 text-xs">
                      {config.endpoint}
                    </td>
                    <td className="p-4">
                      {editingConfig === config.id ? (
                        <input
                          type="number"
                          value={editValues.max_requests}
                          onChange={(e) =>
                            setEditValues({ ...editValues, max_requests: e.target.value })
                          }
                          className="w-24 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-emerald-500"
                        />
                      ) : (
                        <span className="text-white font-medium">{config.max_requests}</span>
                      )}
                    </td>
                    <td className="p-4">
                      {editingConfig === config.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={editValues.window_ms}
                            onChange={(e) =>
                              setEditValues({ ...editValues, window_ms: e.target.value })
                            }
                            className="w-28 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-emerald-500"
                          />
                          <span className="text-gray-500 text-xs">ms</span>
                        </div>
                      ) : (
                        <span className="text-gray-400">
                          {formatWindowMs(config.window_ms)}
                          <span className="text-gray-600 text-xs ml-1">
                            ({config.window_ms.toLocaleString()}ms)
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      {editingConfig === config.id ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdit(config.id)}
                            className="text-emerald-400 hover:text-emerald-300 text-xs"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingConfig(null)}
                            className="text-gray-400 hover:text-gray-300 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(config)}
                          className="text-blue-400 hover:text-blue-300 text-xs"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Usage Stats */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold">Current Usage</h2>
          <p className="text-gray-400 text-sm mt-1">Requests in current window per agent</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="text-left p-4 font-medium">Agent</th>
                <th className="text-left p-4 font-medium">Endpoint</th>
                <th className="text-left p-4 font-medium">Requests</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={3} className="p-4">
                    <div className="h-4 bg-gray-700 rounded animate-pulse" />
                  </td>
                </tr>
              ) : usage.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-gray-500">
                    No rate limit usage data
                  </td>
                </tr>
              ) : (
                usage.map((u, i) => (
                  <tr key={i} className="hover:bg-gray-750">
                    <td className="p-4 text-white font-medium">{u.agent_name}</td>
                    <td className="p-4 font-mono text-emerald-400 text-xs">{u.endpoint}</td>
                    <td className="p-4">
                      <span className="text-white font-medium">{u.count}</span>
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
