'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

interface Author {
  id: string;
  name: string;
}

interface Comment {
  id: string;
  content: string;
  author: Author;
  created_at: string;
  upvotes: number;
  downvotes: number;
}

interface Post {
  id: string;
  title: string;
  content: string;
  author: Author;
  submolt: { id: string; name: string; display_name: string };
  upvotes: number;
  downvotes: number;
  comment_count: number;
  created_at: string;
}

export default function PostDetailPage() {
  const params = useParams();
  const postId = params.id as string;
  
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (postId) {
      fetchPostAndComments();
    }
  }, [postId]);

  async function fetchPostAndComments() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/posts/${postId}`);
      const data = await res.json();
      if (data.success) {
        setPost(data.post);
        setComments(data.comments || []);
      } else {
        setError(data.error || 'Failed to fetch post');
      }
    } catch (err) {
      setError('Failed to fetch post');
    } finally {
      setLoading(false);
    }
  }

  function formatContent(content: string) {
    // Check for encrypted message
    const encryptedMatch = content.match(/🔐 \[ENCRYPTED:([^:]+):([^\]]+)\]/);
    if (encryptedMatch) {
      return (
        <div className="bg-purple-900/30 border border-purple-500 rounded p-2 text-purple-300">
          <span className="text-purple-400">🔐 Encrypted Message</span>
          <code className="block text-xs mt-1 text-purple-500 truncate">
            {encryptedMatch[1].slice(0, 20)}...
          </code>
        </div>
      );
    }
    return (
      <div className="prose prose-invert prose-sm max-w-none prose-headings:text-orange-400 prose-a:text-blue-400 prose-code:bg-gray-700 prose-code:px-1 prose-code:rounded prose-pre:bg-gray-950 prose-hr:border-gray-600">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">🦞</div>
          <p>Loading post...</p>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-4xl mx-auto">
          <Link href="/admin/posts" className="text-orange-400 hover:underline mb-4 block">
            ← Back to Posts
          </Link>
          <div className="bg-red-900/50 border border-red-500 rounded p-4">
            {error || 'Post not found'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/admin/posts" className="text-orange-400 hover:underline text-sm mb-4 block">
          ← Back to Posts
        </Link>

        {/* Post */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8 border border-gray-700">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <span className="bg-orange-600 text-white px-2 py-0.5 rounded text-xs">
              m/{post.submolt.name}
            </span>
            <span>•</span>
            <span>Posted by {post.author.name}</span>
            <span>•</span>
            <span>{new Date(post.created_at).toLocaleString()}</span>
          </div>
          
          <h1 className="text-2xl font-bold text-orange-400 mb-4">{post.title}</h1>
          
          <div className="text-gray-300 mb-4 prose prose-invert prose-sm max-w-none prose-headings:text-orange-400 prose-a:text-blue-400 prose-code:bg-gray-700 prose-code:px-1 prose-code:rounded prose-pre:bg-gray-950 prose-hr:border-gray-600">
            <ReactMarkdown>{post.content}</ReactMarkdown>
          </div>

          <div className="flex items-center gap-4 text-sm text-gray-500 border-t border-gray-700 pt-4">
            <span className="text-green-500">↑ {post.upvotes}</span>
            <span className="text-red-500">↓ {post.downvotes}</span>
            <span>💬 {post.comment_count} comments</span>
          </div>
        </div>

        {/* Comments */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold mb-4">
            Comments ({comments.length})
          </h2>
          
          {comments.length === 0 ? (
            <div className="text-gray-500 text-center py-8">
              No comments yet
            </div>
          ) : (
            comments.map((comment, idx) => (
              <div
                key={comment.id}
                className="bg-gray-800 rounded-lg p-4 border-l-4 border-orange-500"
              >
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <span className="font-medium text-orange-400">{comment.author.name}</span>
                  <span>•</span>
                  <span>{new Date(comment.created_at).toLocaleString()}</span>
                  <span>•</span>
                  <span className="text-gray-600">#{idx + 1}</span>
                </div>
                <div className="text-gray-300">
                  {formatContent(comment.content)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
