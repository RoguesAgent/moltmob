// ── MoltbookService ──
// Interface for Moltbook interactions. Two implementations:
// 1. MockMoltbookService — writes to local Supabase only (test mode)
// 2. LiveMoltbookService — writes to real Moltbook API AND shadows to local state
//
// The game engine calls this service; it never touches Moltbook directly.

import { MoltbookPost } from './orchestrator';

export interface MoltbookServiceConfig {
  apiBaseUrl: string; // e.g., https://moltbook.com/api/v1
  apiKey: string; // agent API key for Moltbook
  submolt: string; // e.g., 'moltmob'
  testMode: boolean;
}

export interface PostedContent {
  id: string;
  title?: string;
  content: string;
  parent_id?: string;
  submolt: string;
  created_at: string;
}

export interface MoltbookService {
  /** Create a new top-level post */
  createPost(title: string, content: string): Promise<PostedContent>;

  /** Create a comment (reply) on a post */
  createComment(postId: string, content: string, parentId?: string): Promise<PostedContent>;

  /** Pin a post */
  pinPost(postId: string): Promise<void>;

  /** Publish a batch of game posts/comments to a thread */
  publishToThread(gamePostId: string, posts: MoltbookPost[]): Promise<PostedContent[]>;
}

/**
 * Mock implementation — writes to local state only.
 * Used in test mode and for the local Moltbook mirror.
 */
export class MockMoltbookService implements MoltbookService {
  private posts: PostedContent[] = [];
  private nextId = 1;

  async createPost(title: string, content: string): Promise<PostedContent> {
    const post: PostedContent = {
      id: `mock-post-${this.nextId++}`,
      title,
      content,
      submolt: 'moltmob',
      created_at: new Date().toISOString(),
    };
    this.posts.push(post);
    return post;
  }

  async createComment(postId: string, content: string, parentId?: string): Promise<PostedContent> {
    const comment: PostedContent = {
      id: `mock-comment-${this.nextId++}`,
      content,
      parent_id: parentId || postId,
      submolt: 'moltmob',
      created_at: new Date().toISOString(),
    };
    this.posts.push(comment);
    return comment;
  }

  async pinPost(_postId: string): Promise<void> {
    // No-op in mock
  }

  async publishToThread(gamePostId: string, posts: MoltbookPost[]): Promise<PostedContent[]> {
    const results: PostedContent[] = [];
    for (const post of posts) {
      if (post.title) {
        // Top-level post (used for game start/end)
        results.push(await this.createPost(post.title, post.content));
      } else {
        // Comment on the game thread
        results.push(await this.createComment(gamePostId, post.content, post.parent_id));
      }
    }
    return results;
  }

  /** Get all posts (for testing/inspection) */
  getAllPosts(): PostedContent[] {
    return [...this.posts];
  }

  /** Reset all state */
  reset(): void {
    this.posts = [];
    this.nextId = 1;
  }
}

/**
 * Retry wrapper with exponential backoff for rate-limited requests.
 * Respects Moltbook's retry_after_seconds header.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);

      // Check for rate limiting
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        const retryAfter = data.retry_after_seconds || Math.pow(2, attempt);
        console.log(`[Moltbook] Rate limited. Retrying after ${retryAfter}s... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue; // Retry this attempt
      }

      // Check for other errors that might benefit from retry
      if (res.status >= 500 && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s
        console.log(`[Moltbook] Server error ${res.status}. Retrying after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`[Moltbook] Network error. Retrying after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Live implementation — writes to real Moltbook API + shadows to local state.
 * Falls back gracefully if Moltbook is down (logs error, continues with local state).
 * Includes retry logic with exponential backoff for rate limits.
 */
export class LiveMoltbookService implements MoltbookService {
  private config: MoltbookServiceConfig;
  private mock: MockMoltbookService; // local shadow

  constructor(config: MoltbookServiceConfig) {
    this.config = config;
    this.mock = new MockMoltbookService();
  }

  private get headers() {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async createPost(title: string, content: string): Promise<PostedContent> {
    // Shadow to local first (always succeeds)
    const local = await this.mock.createPost(title, content);

    try {
      const res = await fetchWithRetry(`${this.config.apiBaseUrl}/posts`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          title,
          content,
          submolt: this.config.submolt,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          id: data.post?.id || data.id || local.id,
          title,
          content,
          submolt: this.config.submolt,
          created_at: data.post?.created_at || local.created_at,
        };
      }

      console.error(`Moltbook createPost failed: ${res.status} ${res.statusText}`);
    } catch (err) {
      console.error('Moltbook createPost error:', err);
    }

    // Return local shadow on failure
    return local;
  }

  async createComment(postId: string, content: string, parentId?: string): Promise<PostedContent> {
    const local = await this.mock.createComment(postId, content, parentId);

    try {
      const res = await fetchWithRetry(`${this.config.apiBaseUrl}/posts/${postId}/comments`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          content,
          parent_id: parentId || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          id: data.comment?.id || data.id || local.id,
          content,
          parent_id: parentId || postId,
          submolt: this.config.submolt,
          created_at: data.comment?.created_at || local.created_at,
        };
      }

      console.error(`Moltbook createComment failed: ${res.status} ${res.statusText}`);
    } catch (err) {
      console.error('Moltbook createComment error:', err);
    }

    return local;
  }

  async pinPost(postId: string): Promise<void> {
    try {
      await fetchWithRetry(`${this.config.apiBaseUrl}/posts/${postId}/pin`, {
        method: 'POST',
        headers: this.headers,
      });
    } catch (err) {
      console.error('Moltbook pinPost error:', err);
    }
  }

  async publishToThread(gamePostId: string, posts: MoltbookPost[]): Promise<PostedContent[]> {
    const results: PostedContent[] = [];
    for (const post of posts) {
      if (post.title) {
        results.push(await this.createPost(post.title, post.content));
      } else {
        results.push(await this.createComment(gamePostId, post.content, post.parent_id));
        // Rate limit protection: add delay between sequential comments
        if (posts.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    return results;
  }

  /** Access the local shadow for admin dashboard */
  getLocalState(): MockMoltbookService {
    return this.mock;
  }
}

/**
 * Factory: create the right service based on config.
 */
export function createMoltbookService(config: MoltbookServiceConfig): MoltbookService {
  if (config.testMode) {
    return new MockMoltbookService();
  }
  return new LiveMoltbookService(config);
}
