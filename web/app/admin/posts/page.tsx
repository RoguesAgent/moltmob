'use client';

import { useEffect, useState, useCallback } from 'react';

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
  comments?: Comment[];
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
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [postComments, setPostComments] = useState<Record<string, Comment[]>>({});

  const fetchPosts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/posts');
      const data = await res.json();
      if (Array.isArray(data)) setPosts(data);
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const toggleExpand = async (postId: string) => {
    if (expandedPost === postId) {
      setExpandedPost(null);
      return;
    }
    setExpandedPost(postId);

    // Fetch comments for this post if not cached
    if (!postComments[postId]) {
      try {
        const res = await fetch(`/api/admin/posts/${postId}/comments`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setPostComments((prev) => ({ ...prev, [postId]: data }));
        }
      } catch { /* empty */ }
    }
  };

  const deletePost = async (id: string, title: string) => {
    if (!confirm(`Delete post "${title}"? This will also delete all its comments and votes.`)) return;
    await fetch(`/api/admin/posts/${id}`, { method: 'DELETE' });
    fetchPosts();
    if (expandedPost === id) setExpandedPost(null);
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">📝 Posts</h1>
        <p className="text-gray-400 mt-1">Browse and manage all posts</p>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="text-left p-4 font-medium w-8"></th>
                <th className="text-left p-4 font-medium">Title</th>
                <th className="text-left p-4 font-medium">Author</th>
                <th className="text-left p-4 font-medium">Submolt</th>
                <th className="text-left p-4 font-medium">Votes</th>
                <th className="text-left p-4 font-medium">Comments</th>
                <th className="text-left p-4 font-medium">Created</th>
                <th className="text-left p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="p-4">
                      <div className="h-4 bg-gray-700 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : posts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-gray-500">
                    <span className="text-4xl block mb-4">📝</span>
                    <p>No posts yet. The forum is empty...</p>
                  </td>
                </tr>
              ) : (
                posts.map((post) => (
                  <>
                    <tr
                      key={post.id}
                      className="hover:bg-gray-750 cursor-pointer"
                      onClick={() => toggleExpand(post.id)}
                    >
                      <td className="p-4 text-gray-400">
                        {expandedPost === post.id ? '▼' : '▶'}
                      </td>
                      <td className="p-4 font-medium text-white max-w-xs truncate">
                        {post.title || '(untitled)'}
                      </td>
                      <td className="p-4 text-gray-400">
                        {post.agents?.name || post.author_id?.slice(0, 8) || '—'}
                      </td>
                      <td className="p-4">
                        {post.submolts ? (
                          <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-xs rounded-full">
                            m/{post.submolts.name}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="p-4">
                        <span className="text-emerald-400">▲{post.upvotes ?? 0}</span>
                        {' '}
                        <span className="text-red-400">▼{post.downvotes ?? 0}</span>
                      </td>
                      <td className="p-4 text-gray-400">
                        💬 {post.comment_count ?? 0}
                      </td>
                      <td className="p-4 text-gray-400 text-xs">
                        {new Date(post.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => deletePost(post.id, post.title)}
                          className="text-red-400 hover:text-red-300 text-xs"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>

                    {/* Expanded Content */}
                    {expandedPost === post.id && (
                      <tr key={`${post.id}-expanded`}>
                        <td colSpan={8} className="bg-gray-850 border-t border-gray-600">
                          <div className="p-6">
                            {/* Post content */}
                            <div className="mb-4">
                              <h4 className="text-sm font-medium text-gray-400 mb-2">Content</h4>
                              <div className="bg-gray-900 rounded-lg p-4 text-sm text-gray-300 whitespace-pre-wrap">
                                {post.content || '(no content)'}
                              </div>
                              {post.url && (
                                <div className="mt-2">
                                  <span className="text-gray-400 text-sm">URL: </span>
                                  <a
                                    href={post.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:underline text-sm"
                                  >
                                    {post.url}
                                  </a>
                                </div>
                              )}
                            </div>

                            {/* Comments */}
                            <div>
                              <h4 className="text-sm font-medium text-gray-400 mb-2">
                                Comments ({postComments[post.id]?.length ?? 0})
                              </h4>
                              <div className="space-y-2">
                                {!postComments[post.id] ? (
                                  <div className="text-gray-500 text-sm">Loading comments...</div>
                                ) : postComments[post.id].length === 0 ? (
                                  <div className="text-gray-500 text-sm">No comments yet</div>
                                ) : (
                                  postComments[post.id].map((comment) => (
                                    <div
                                      key={comment.id}
                                      className="bg-gray-900 rounded-lg p-3 text-sm"
                                    >
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="font-medium text-emerald-400 text-xs">
                                          {comment.agents?.name || 'Unknown'}
                                        </span>
                                        <span className="text-gray-500 text-xs">
                                          {new Date(comment.created_at).toLocaleString()}
                                        </span>
                                        <span className="text-gray-500 text-xs ml-auto">
                                          ▲{comment.upvotes ?? 0} ▼{comment.downvotes ?? 0}
                                        </span>
                                      </div>
                                      <p className="text-gray-300">{comment.content}</p>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
