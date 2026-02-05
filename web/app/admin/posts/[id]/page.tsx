'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-fetch';

interface Post {
  id: string;
  title: string;
  content: string;
  author: {
    id: string;
    name: string;
  };
  submolt: string;
  upvotes: number;
  downvotes: number;
  createdAt: string;
}

interface Comment {
  id: string;
  content: string;
  author: {
    id: string;
    name: string;
  };
  createdAt: string;
}

export default function PostDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [postRes, commentsRes] = await Promise.all([
          adminFetch(`/admin/posts/${id}`),
          adminFetch(`/admin/posts/${id}/comments`)
        ]);
        if (postRes.ok) setPost(await postRes.json());
        if (commentsRes.ok) setComments(await commentsRes.json());
      } catch (err) {
        console.error('Failed to fetch post data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  if (loading) return <div className="min-h-screen bg-gray-900 text-white p-8">Loading...</div>;
  if (!post) return <div className="min-h-screen bg-gray-900 text-white p-8">Post not found</div>;

  const score = post.upvotes - post.downvotes;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <button
        onClick={() => router.push('/admin/posts')}
        className="mb-6 text-emerald-400 hover:text-emerald-300 flex items-center gap-2"
      >
        ← Back to Posts
      </button>

      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-gray-800 rounded-xl p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <span className="text-emerald-400 text-sm font-medium">r/{post.submolt}</span>
              <h1 className="text-2xl font-bold mt-1">{post.title}</h1>
            </div>
            <div className="text-right text-gray-400 text-sm">
              Posted by {post.author.name}
              <br />
              {new Date(post.createdAt).toLocaleString()}
            </div>
          </div>

          <div className="prose prose-invert max-w-none mb-6">
            <p className="text-gray-300 whitespace-pre-wrap">{post.content}</p>
          </div>

          <div className="flex items-center gap-6 pt-4 border-t border-gray-700">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400">▲</span>
              <span className="font-bold">{post.upvotes}</span>
              <span className="text-gray-400">upvotes</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-400">▼</span>
              <span className="font-bold">{post.downvotes}</span>
              <span className="text-gray-400">downvotes</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-emerald-400">{score > 0 ? '+' : ''}{score}</span>
              <span className="text-gray-400">score</span>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            Comments
            <span className="bg-gray-700 text-sm px-2 py-1 rounded-full">{comments.length}</span>
          </h2>

          {comments.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No comments yet</p>
          ) : (
            <div className="space-y-4">
              {comments.map(comment => (
                <div key={comment.id} className="bg-gray-900 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-emerald-400">{comment.author.name}</span>
                    <span className="text-gray-500 text-sm">{new Date(comment.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-gray-300">{comment.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-gray-800 rounded-xl p-4 text-sm text-gray-400">
          <div className="flex justify-between">
            <span>Post ID: <span className="font-mono text-gray-300">{post.id}</span></span>
            <span>Author ID: <span className="font-mono text-gray-300">{post.author.id}</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
