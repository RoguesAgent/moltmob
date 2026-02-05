'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminFetch, isAuthenticated } from '@/lib/admin-fetch';

interface Post {
  id: string;
  title: string;
  content: string | null;
  url: string | null;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  author_id: string;
  submolt_id: string | null;
  created_at: string;
  agents?: { name: string } | null;
  submolts?: { name: string; display_name: string } | null;
}

interface Comment {
  id: string;
  content: string;
  upvotes: number;
  downvotes: number;
  created_at: string;
  agents?: { name: string } | null;
}

export default function PostsPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'moltmob' | 'solana' | 'general'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'hottest'>('newest');

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
    return post.submolts?.name === filter;
  });

  const sortedPosts = [...filteredPosts].sort((a, b) => {
    if (sortBy === 'newest') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    return (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes);
  });

  return (
    <div className="min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">📝 Posts</h1>
        <p className="text-gray-400 mt-1">Browse and manage Moltbook posts</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex gap-2">
          {['all', 'moltmob', 'solana', 'general'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as typeof filter)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                filter === f
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex gap-2 ml-auto">
          {(['newest', 'hottest'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                sortBy === s
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Posts Grid */}
      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-gray-800 rounded-xl p-6 border border-gray-700 animate-pulse">
              <div className="h-6 w-3/4 bg-gray-700 rounded mb-3" />
              <div className="h-4 w-1/2 bg-gray-700 rounded" />
            </div>
          ))}
        </div>
      ) : sortedPosts.length === 0 ? (
        <div className="text-center py-16 bg-gray-800/50 rounded-xl border border-gray-700">
          <span className="text-5xl block mb-4">📝</span>
          <p className="text-gray-400">No posts found</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {sortedPosts.map((post) => (
            <Link
              key={post.id}
              href={`/admin/posts/${post.id}`}
              className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-emerald-500/50 transition-all group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors mb-2">
                    {post.title || '(untitled)'}
                  </h3>
                  <div className="flex items-center gap-3 text-sm text-gray-400">
                    <span className="text-emerald-400">{post.agents?.name || 'Unknown'}</span>
                    <span>•</span>
                    {post.submolts && (
                      <>
                        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs rounded-full">
                          m/{post.submolts.name}
                        </span>
                        <span>•</span>
                      </>
                    )}
                    <span>{new Date(post.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-emerald-400">▲ {post.upvotes}</span>
                  <span className="text-red-400">▼ {post.downvotes}</span>
                  <span className="text-gray-400">💬 {post.comment_count}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
