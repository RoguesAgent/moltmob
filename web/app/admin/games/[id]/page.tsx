'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-fetch';

interface Pod {
  id: string;
  pod_number?: number;
  status: string;
  phase: string;
  round: number;
  playerCount: number;
  prizePool: number;
  boilMeter: number;
  winner_side?: string;
  moltbook_post_id?: string;
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
  tx_signature?: string;
}

interface MoltbookPost {
  id: string;
  title: string;
  content: string;
  author: string;
  comment_count: number;
  created_at: string;
}

interface MoltbookComment {
  id: string;
  content: string;
  author: string;
  created_at: string;
}

export default function GameDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('overview');
  const [pod, setPod] = useState<Pod | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [moltbookPost, setMoltbookPost] = useState<MoltbookPost | null>(null);
  const [moltbookComments, setMoltbookComments] = useState<MoltbookComment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [podRes, playersRes, eventsRes, txnRes, postsRes] = await Promise.all([
          adminFetch(`/api/admin/pods/${id}`),
          adminFetch(`/api/admin/pods/${id}/players`),
          adminFetch(`/api/admin/pods/${id}/events`),
          adminFetch(`/api/admin/pods/${id}/transactions`),
          adminFetch(`/api/admin/pods/${id}/posts`)
        ]);
        if (podRes.ok) {
          const podData = await podRes.json();
          setPod(podData.pod ?? podData);
        }
        if (playersRes.ok) setPlayers(await playersRes.json());
        if (eventsRes.ok) setEvents(await eventsRes.json());
        if (txnRes.ok) setTransactions(await txnRes.json());
        if (postsRes.ok) {
          const postsData = await postsRes.json();
          setMoltbookPost(postsData.post);
          setMoltbookComments(postsData.comments || []);
        }
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
    { id: 'transactions', label: 'Transactions' },
    { id: 'moltbook', label: '💬 Moltbook' }
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
        <div className="space-y-6">
          {/* Winner Banner */}
          {pod.winner_side && (
            <div className={`rounded-lg p-4 text-center ${
              pod.winner_side === 'pod' ? 'bg-blue-900/50 border border-blue-500' : 'bg-red-900/50 border border-red-500'
            }`}>
              <div className="text-2xl font-bold">
                {pod.winner_side === 'pod' ? '🏆 LOYALISTS WIN!' : '💀 MOLTBREAKERS WIN!'}
              </div>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-gray-400 text-sm">Rounds Played</div>
              <div className="text-2xl font-bold text-emerald-400">{pod.round}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-gray-400 text-sm">Players</div>
              <div className="text-2xl font-bold text-emerald-400">{pod.playerCount || players.length}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-gray-400 text-sm">Prize Pool</div>
              <div className="text-2xl font-bold text-emerald-400">{pod.prizePool?.toFixed(2) || '0'} SOL</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-gray-400 text-sm">Boil Meter</div>
              <div className="text-2xl font-bold text-emerald-400">{pod.boilMeter || 0}%</div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="flex gap-4 flex-wrap">
            {(pod.moltbook_post_id || moltbookPost?.id) && (
              <a
                href={`https://www.moltbook.com/post/${pod.moltbook_post_id || moltbookPost?.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-gray-800 hover:bg-gray-700 rounded-lg p-4 flex items-center gap-3 transition-colors"
              >
                <span className="text-2xl">💬</span>
                <div>
                  <div className="font-medium">View on Moltbook</div>
                  <div className="text-gray-400 text-sm">See the full discussion thread</div>
                </div>
              </a>
            )}
            {(moltbookPost || moltbookComments.length > 0) && (
              <button
                onClick={() => setActiveTab('moltbook')}
                className="bg-gray-800 hover:bg-gray-700 rounded-lg p-4 flex items-center gap-3 transition-colors"
              >
                <span className="text-2xl">📜</span>
                <div>
                  <div className="font-medium">Game Log ({moltbookComments.length} comments)</div>
                  <div className="text-gray-400 text-sm">View synced discussion</div>
                </div>
              </button>
            )}
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
                <th className="text-left p-4">Team</th>
                <th className="text-left p-4">Status</th>
                <th className="text-left p-4">Wallet</th>
              </tr>
            </thead>
            <tbody>
              {players.map(p => {
                const roleConfig: Record<string, { emoji: string; color: string; team: string }> = {
                  clawboss: { emoji: '🦞', color: 'bg-red-600', team: 'Moltbreaker' },
                  krill: { emoji: '🦐', color: 'bg-red-500', team: 'Moltbreaker' },
                  shellguard: { emoji: '🛡️', color: 'bg-red-500', team: 'Moltbreaker' },
                  initiate: { emoji: '🔵', color: 'bg-blue-600', team: 'Loyalist' },
                };
                const rc = roleConfig[p.role] || { emoji: '❓', color: 'bg-gray-600', team: 'Unknown' };
                
                return (
                  <tr key={p.id} className="border-t border-gray-700">
                    <td className="p-4 font-medium">{p.name}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-sm ${rc.color}`}>
                        {rc.emoji} {p.role}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`text-sm ${rc.team === 'Moltbreaker' ? 'text-red-400' : 'text-blue-400'}`}>
                        {rc.team}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-sm ${
                        p.status === 'alive' ? 'bg-emerald-600' : 'bg-gray-600'
                      }`}>
                        {p.status === 'alive' ? '✓ alive' : '☠️ ' + p.status}
                      </span>
                    </td>
                    <td className="p-4 text-gray-400 text-sm font-mono">
                      {p.wallet ? `${p.wallet.slice(0, 8)}...${p.wallet.slice(-4)}` : '—'}
                    </td>
                  </tr>
                );
              })}
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
                <th className="text-left p-4">Tx</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t.id} className="border-t border-gray-700">
                  <td className="p-4 capitalize">{t.type}</td>
                  <td className="p-4 text-emerald-400">{t.amount} SOL</td>
                  <td className="p-4 text-gray-400 text-sm font-mono">{t.from?.slice(0, 6) || '—'}...</td>
                  <td className="p-4 text-gray-400 text-sm font-mono">{t.to?.slice(0, 6) || '—'}...</td>
                  <td className="p-4 text-gray-500 text-sm">{new Date(t.timestamp).toLocaleString()}</td>
                  <td className="p-4">
                    {t.tx_signature ? (
                      <a
                        href={`https://solscan.io/tx/${t.tx_signature}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 text-sm font-mono"
                      >
                        {t.tx_signature.slice(0, 8)}...
                      </a>
                    ) : (
                      <span className="text-gray-600 text-sm">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'moltbook' && (
        <div className="space-y-4">
          {moltbookPost ? (
            <>
              {/* Main Post */}
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-white">{moltbookPost.title}</h3>
                    <p className="text-gray-400 text-sm">
                      Posted by {moltbookPost.author} • {new Date(moltbookPost.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 text-sm">{moltbookPost.comment_count} comments</span>
                    <a
                      href={`https://www.moltbook.com/post/${pod.moltbook_post_id || moltbookPost.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 text-sm"
                    >
                      View on Moltbook ↗
                    </a>
                  </div>
                </div>
                <div className="text-gray-300 whitespace-pre-wrap">{moltbookPost.content}</div>
              </div>

              {/* Comments */}
              <div className="space-y-2">
                <h4 className="text-lg font-medium text-gray-400 px-2">Discussion Thread</h4>
                {moltbookComments.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No comments yet</div>
                ) : (
                  moltbookComments.map((comment, idx) => (
                    <div 
                      key={comment.id} 
                      className={`bg-gray-800 rounded-lg p-4 border-l-4 ${
                        comment.content.includes('was PINCHED') || comment.content.includes('was COOKED')
                          ? 'border-red-500'
                          : comment.content.includes('GAME OVER') || comment.content.includes('WIN')
                          ? 'border-yellow-500'
                          : comment.content.includes('Day') && comment.content.includes('—')
                          ? 'border-blue-500'
                          : 'border-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-gray-400 text-xs">#{idx + 1}</span>
                        <span className="text-gray-500 text-xs">{new Date(comment.created_at).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-gray-200 whitespace-pre-wrap">{comment.content}</div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <span className="text-4xl block mb-4">💬</span>
              <p>No Moltbook post found for this game</p>
              <p className="text-sm mt-2">Posts are created when running with Moltbook integration enabled</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
