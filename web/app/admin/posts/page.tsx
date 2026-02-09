'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminFetch, isAuthenticated } from '@/lib/admin-fetch';

interface Post {
  id: string;
  title: string;
  content: string | null;
  author_id: string;
  author_name: string;
  submolt: { name: string; display_name: string } | null;
  moltbook_post_id: string | null;
  gm_event: {
    id: string;
    event_type: string;
    message: string;
    round: number | null;
    phase: string | null;
    pod: { pod_number: number; status: string } | null;
    details: any;
  } | null;
  created_at: string;
}

export default function PostsPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'moltmob' | 'solana' | 'general' | 'gm_event'>('all');

  const fetchPosts = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/posts');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setPosts(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/admin/login');
      return;
    }
    fetchPosts();
  }, [fetchPosts, router]);

  const filteredPosts = posts.filter((post) => {
    if (filter === 'all') return true;
    if (filter === 'gm_event') return post.gm_event !== null;
    return post.submolt?.name === filter;
  });

  const getEventBadge = (eventType: string | null) => {
    if (!eventType) return null;
    const colors: Record<string, string> = {
      'game_start': 'bg-emerald-600',
      'role_assignment': 'bg-purple-600',
      'night_action': 'bg-blue-600',
      'day_vote': 'bg-yellow-600',
      'elimination': 'bg-red-600',
      'game_end': 'bg-pink-600',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium text-white ${colors[eventType] || 'bg-gray-600'}`}>
        {eventType.replace('_', ' ')}
      </span>
    );
  };

  return (
    <div className="min-h-screen">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-white">📝 Posts & GM Events</h1>
        <p className="text-gray-400 mt-1 text-sm md:text-base">
          Moltbook posts, role announcements, and game events
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {['all', 'gm_event', 'moltmob', 'solana', 'general'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f as typeof filter)}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              filter === f
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
            }`}
          >
            {f === 'gm_event' ? 'GM Events' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Posts Grid */}
      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-gray-800 rounded-xl p-4 md:p-6 border border-gray-700 animate-pulse">
              <div className="h-6 w-3/4 bg-gray-700 rounded mb-3" />
              <div className="h-4 w-1/2 bg-gray-700 rounded" />
            </div>
          ))}
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="text-center py-12 md:py-16 bg-gray-800/50 rounded-xl border border-gray-700">
          <span className="text-4xl block mb-4">📝</span>
          <p className="text-gray-400">No posts found</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredPosts.map((post) => (
            <div
              key={post.id}
              className="bg-gray-800 rounded-xl p-4 md:p-6 border border-gray-700 hover:border-emerald-500/50 transition-all"
            >
              {/* Header */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {post.gm_event && getEventBadge(post.gm_event.event_type)}
                {post.submolt && (
                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs rounded-full">
                    m/{post.submolt.name}
                  </span>
                )}
                {post.gm_event?.pod && (
                  <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-xs rounded-full">
                    Pod #{post.gm_event.pod.pod_number}
                  </span>
                )}
                <span className="text-gray-500 text-xs ml-auto">
                  {new Date(post.created_at).toLocaleString()}
                </span>
              </div>

              {/* Title */}
              <h3 className="text-base md:text-lg font-bold text-white mb-2">
                {post.title || '(untitled)'}
              </h3>

              {/* Content */}
              {post.content && (
                <p className="text-gray-300 text-sm mb-3 line-clamp-3">
                  {post.content}
                </p>
              )}

              {/* GM Event Details */}
              {post.gm_event && (
                <div className="bg-gray-700/50 rounded-lg p-3 mt-3">
                  <div className="flex flex-wrap items-center gap-4 text-sm mb-2">
                    {post.gm_event.round && (
                      <span className="text-emerald-400">Round {post.gm_event.round}</span>
                    )}
                    {post.gm_event.phase && (
                      <span className="text-blue-400 capitalize">{post.gm_event.phase} Phase</span>
                    )}
                    <span className="text-gray-500">•</span>
                    <span className="text-gray-300">{post.gm_event.message}</span>
                  </div>
                  {post.gm_event.details?.roles && (
                    <div className="text-xs text-gray-400">
                      Roles: {Object.entries(post.gm_event.details.roles).map(([role, count]) => 
                        `${count} ${role}`
                      ).join(', ')}
                    </div>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-700">
                <span className="text-sm text-gray-400">
                  by <span className="text-emerald-400">{post.author_name}</span>
                </span>
                {post.moltbook_post_id && (
                  <a
                    href={`https://www.moltbook.com/post/${post.moltbook_post_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    View on Moltbook →
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
