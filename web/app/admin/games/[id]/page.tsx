'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-fetch';

interface Pod {
  id: string;
  status: string;
  phase: string;
  round: number;
  playerCount: number;
  prizePool: number;
  boilMeter: number;
}

interface Player {
  id: string;
  name: string;
  role: string;
  status: 'alive' | 'eliminated';
  wallet: string;
}

interface Event {
  id: string;
  type: string;
  message: string;
  timestamp: string;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  from: string;
  to: string;
  timestamp: string;
}

export default function GameDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('overview');
  const [pod, setPod] = useState<Pod | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [podRes, playersRes, eventsRes, txnRes] = await Promise.all([
          adminFetch(`/api/admin/pods/${id}`),
          adminFetch(`/api/admin/pods/${id}/players`),
          adminFetch(`/api/admin/pods/${id}/events`),
          adminFetch(`/api/admin/pods/${id}/transactions`)
        ]);
        if (podRes.ok) setPod(await podRes.json());
        if (playersRes.ok) setPlayers(await playersRes.json());
        if (eventsRes.ok) setEvents(await eventsRes.json());
        if (txnRes.ok) setTransactions(await txnRes.json());
      } catch (err) {
        console.error('Failed to fetch game data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  if (loading) return <div className="min-h-screen bg-gray-900 text-white p-8">Loading...</div>;
  if (!pod) return <div className="min-h-screen bg-gray-900 text-white p-8">Pod not found</div>;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'players', label: 'Players' },
    { id: 'events', label: 'Events' },
    { id: 'transactions', label: 'Transactions' }
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <button
        onClick={() => router.push('/admin/games')}
        className="mb-6 text-emerald-400 hover:text-emerald-300 flex items-center gap-2"
      >
        ← Back to Games
      </button>

      <h1 className="text-3xl font-bold mb-2">Game #{id}</h1>
      <div className="flex items-center gap-4 mb-6">
        <span className={`px-3 py-1 rounded-full text-sm ${
          pod.status === 'active' ? 'bg-emerald-600' : 'bg-gray-600'
        }`}>{pod.status}</span>
        <span className="text-gray-400">Phase: {pod.phase}</span>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-700">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 font-medium ${
              activeTab === tab.id
                ? 'text-emerald-400 border-b-2 border-emerald-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-gray-400 text-sm">Round</div>
            <div className="text-2xl font-bold text-emerald-400">{pod.round}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-gray-400 text-sm">Players</div>
            <div className="text-2xl font-bold text-emerald-400">{pod.playerCount}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-gray-400 text-sm">Prize Pool</div>
            <div className="text-2xl font-bold text-emerald-400">{pod.prizePool} SOL</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-gray-400 text-sm">Boil Meter</div>
            <div className="text-2xl font-bold text-emerald-400">{pod.boilMeter}%</div>
          </div>
        </div>
      )}

      {activeTab === 'players' && (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left p-4">Name</th>
                <th className="text-left p-4">Role</th>
                <th className="text-left p-4">Status</th>
                <th className="text-left p-4">Wallet</th>
              </tr>
            </thead>
            <tbody>
              {players.map(p => (
                <tr key={p.id} className="border-t border-gray-700">
                  <td className="p-4">{p.name}</td>
                  <td className="p-4"><span className="px-2 py-1 bg-gray-700 rounded text-sm">{p.role}</span></td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-sm ${
                      p.status === 'alive' ? 'bg-emerald-600' : 'bg-red-600'
                    }`}>{p.status}</span>
                  </td>
                  <td className="p-4 text-gray-400 text-sm font-mono">{p.wallet.slice(0, 8)}...{p.wallet.slice(-4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'events' && (
        <div className="space-y-3">
          {events.map(e => (
            <div key={e.id} className="bg-gray-800 rounded-lg p-4 flex items-start gap-4">
              <div className="w-2 h-2 rounded-full bg-emerald-400 mt-2"></div>
              <div className="flex-1">
                <div className="font-medium">{e.type}</div>
                <div className="text-gray-400">{e.message}</div>
              </div>
              <div className="text-gray-500 text-sm">{new Date(e.timestamp).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'transactions' && (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left p-4">Type</th>
                <th className="text-left p-4">Amount</th>
                <th className="text-left p-4">From</th>
                <th className="text-left p-4">To</th>
                <th className="text-left p-4">Time</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t.id} className="border-t border-gray-700">
                  <td className="p-4 capitalize">{t.type}</td>
                  <td className="p-4 text-emerald-400">{t.amount} SOL</td>
                  <td className="p-4 text-gray-400 text-sm font-mono">{t.from.slice(0, 6)}...</td>
                  <td className="p-4 text-gray-400 text-sm font-mono">{t.to.slice(0, 6)}...</td>
                  <td className="p-4 text-gray-500 text-sm">{new Date(t.timestamp).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
