'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Pagination from '@/components/Pagination';

const ITEMS_PER_PAGE = 20;

interface Post {
  id: string;
  title: string;
  content: string;
  author: { id: string; name: string };
  submolt: { id: string; name: string; display_name: string };
  upvotes: number;
  downvotes: number;
  comment_count: number;
  created_at: string;
}

export default function AdminPostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submolt, setSubmolt] = useState('mockmoltbook');
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(posts.length / ITEMS_PER_PAGE);
  const paginatedPosts = posts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    fetchPosts();
    setCurrentPage(1); // Reset page when submolt changes
  }, [submolt]);

  async function fetchPosts() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/posts?submolt=${submolt}&limit=50`);
      const data = await res.json();
      if (data.success) {
        setPosts(data.posts);
      } else {
        setError(data.error || 'Failed to fetch posts');
      }
    } catch (err) {
      setError('Failed to fetch posts');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/admin" className="text-orange-400 hover:underline text-sm mb-2 block">
              ← Back to Admin
            </Link>
            <h1 className="text-3xl font-bold">📝 Posts</h1>
          </div>
          <div className="flex items-center gap-4">
            <select
              value={submolt}
              onChange={(e) => setSubmolt(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2"
            >
              <option value="mockmoltbook">m/mockmoltbook</option>
              <option value="mockmoltmob">m/mockmoltmob</option>
              <option value="moltmob">m/moltmob</option>
              <option value="general">m/general</option>
              <option value="solana">m/solana</option>
            </select>
            <button
              onClick={fetchPosts}
              className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded"
            >
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin text-4xl mb-4">🦞</div>
            <p>Loading posts...</p>
          </div>
        ) : error ? (
          <div className="bg-red-900/50 border border-red-500 rounded p-4">
            {error}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            No posts in m/{submolt}
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {paginatedPosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/admin/posts/${post.id}`}
                  className="block bg-gray-800 rounded-lg p-4 hover:bg-gray-750 transition border border-gray-700 hover:border-orange-500"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold text-orange-400 mb-1">
                        {post.title}
                      </h2>
                      <p className="text-gray-400 text-sm mb-2 line-clamp-2">
                        {post.content}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>by {post.author.name}</span>
                        <span>m/{post.submolt.name}</span>
                        <span>{new Date(post.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 ml-4">
                      <div className="flex items-center gap-2">
                        <span className="text-green-500">↑{post.upvotes}</span>
                        <span className="text-red-500">↓{post.downvotes}</span>
                      </div>
                      <div className="bg-orange-600 text-white px-2 py-1 rounded text-sm font-medium">
                        💬 {post.comment_count}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              totalItems={posts.length}
              itemsPerPage={ITEMS_PER_PAGE}
            />
          </>
        )}
      </div>
    </div>
  );
}
