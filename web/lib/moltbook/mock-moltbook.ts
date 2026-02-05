// ── Mock Moltbook Server ──
// In-memory Moltbook API that mirrors the real API 1:1.
// Same endpoints, same response shapes, same content limits.
// Rate limiting is configurable: off for fast tests, on for realistic simulation.

import { randomUUID } from 'crypto';
import {
  MoltbookPost,
  MoltbookComment,
  MoltbookAgent,
  MoltbookSubmolt,
  RateLimitConfig,
  ListPostsResponse,
  PostResponse,
  CommentResponse,
  ListCommentsResponse,
  VoteResponse,
  ErrorResponse,
  CONTENT_LIMITS,
  NO_RATE_LIMITS,
} from './types';
import { RateLimiter } from './rate-limiter';

type EndpointKey = keyof RateLimitConfig['limits'];

export class MockMoltbook {
  private agents: Map<string, MoltbookAgent> = new Map(); // api_key → agent
  private posts: Map<string, MoltbookPost> = new Map();
  private comments: Map<string, MoltbookComment[]> = new Map(); // post_id → comments
  private votes: Map<string, Map<string, 'up' | 'down'>> = new Map(); // post_id → (agent_id → direction)
  private rateLimiter: RateLimiter;
  private submolts: Map<string, MoltbookSubmolt> = new Map();

  constructor(rateLimitConfig?: RateLimitConfig) {
    this.rateLimiter = new RateLimiter(rateLimitConfig ?? NO_RATE_LIMITS);
    // Seed default submolts
    this.addSubmolt({ id: '29beb7ee-ca7d-4290-9c2f-09926264866f', name: 'general', display_name: 'General' });
    this.addSubmolt({ id: 'moltmob-submolt-id', name: 'moltmob', display_name: 'MoltMob' });
    this.addSubmolt({ id: 'solana-submolt-id', name: 'solana', display_name: 'Solana' });
  }

  // ── Agent Management ──

  /** Register a mock agent. Returns their API key. */
  registerAgent(name: string, walletPubkey: string, balance: number = 0): MoltbookAgent {
    const agent: MoltbookAgent = {
      id: randomUUID(),
      name,
      api_key: `mock_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
      wallet_pubkey: walletPubkey,
      balance,
      created_at: new Date().toISOString(),
    };
    this.agents.set(agent.api_key, agent);
    return agent;
  }

  /** Get agent by API key (auth check). */
  private auth(apiKey: string): MoltbookAgent | ErrorResponse {
    const agent = this.agents.get(apiKey);
    if (!agent) {
      return { success: false, error: 'Invalid API key', code: 401 };
    }
    return agent;
  }

  /** Rate limit check + record. */
  private rateCheck(agentId: string, endpoint: EndpointKey): ErrorResponse | null {
    return this.rateLimiter.consume(agentId, endpoint);
  }

  // ── Submolt Management ──

  addSubmolt(submolt: MoltbookSubmolt): void {
    this.submolts.set(submolt.id, submolt);
  }

  getSubmolt(id: string): MoltbookSubmolt | undefined {
    return this.submolts.get(id);
  }

  // ── API Endpoints (mirror real Moltbook) ──

  /** GET /api/v1/posts?sort=hot|new&limit=N&offset=N */
  listPosts(
    apiKey: string,
    params: { sort?: 'hot' | 'new'; limit?: number; offset?: number }
  ): ListPostsResponse | ErrorResponse {
    const agent = this.auth(apiKey);
    if ('error' in agent) return agent;

    const rlError = this.rateCheck(agent.id, 'GET /posts');
    if (rlError) return rlError;

    const limit = Math.min(params.limit ?? 10, 50);
    const offset = params.offset ?? 0;

    let allPosts = Array.from(this.posts.values());

    // Sort
    if (params.sort === 'new' || !params.sort) {
      allPosts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      // "hot" = upvotes - downvotes + recency boost
      allPosts.sort((a, b) => {
        const scoreA = a.upvotes - a.downvotes + a.comment_count;
        const scoreB = b.upvotes - b.downvotes + b.comment_count;
        return scoreB - scoreA;
      });
    }

    const sliced = allPosts.slice(offset, offset + limit);

    return {
      success: true,
      posts: sliced,
      count: sliced.length,
      has_more: offset + limit < allPosts.length,
      next_offset: offset + limit,
    };
  }

  /** GET /api/v1/posts/:id */
  getPost(apiKey: string, postId: string): PostResponse | ErrorResponse {
    const agent = this.auth(apiKey);
    if ('error' in agent) return agent;

    const rlError = this.rateCheck(agent.id, 'GET /posts/:id');
    if (rlError) return rlError;

    const post = this.posts.get(postId);
    if (!post) {
      return { success: false, error: 'Post not found', code: 404 };
    }

    return { success: true, post };
  }

  /** POST /api/v1/posts */
  createPost(
    apiKey: string,
    body: { title: string; content: string; submolt_id?: string }
  ): PostResponse | ErrorResponse {
    const agent = this.auth(apiKey);
    if ('error' in agent) return agent;

    const rlError = this.rateCheck(agent.id, 'POST /posts');
    if (rlError) return rlError;

    // Content limits
    if (!body.title || body.title.length === 0) {
      return { success: false, error: 'Title is required', code: 400 };
    }
    if (body.title.length > CONTENT_LIMITS.post_title_max) {
      return { success: false, error: `Title exceeds ${CONTENT_LIMITS.post_title_max} characters`, code: 400 };
    }
    if (body.content && body.content.length > CONTENT_LIMITS.post_content_max) {
      return { success: false, error: `Content exceeds ${CONTENT_LIMITS.post_content_max} characters`, code: 400 };
    }

    const submoltId = body.submolt_id ?? '29beb7ee-ca7d-4290-9c2f-09926264866f';
    const submolt = this.submolts.get(submoltId);
    if (!submolt) {
      return { success: false, error: 'Submolt not found', code: 404 };
    }

    const post: MoltbookPost = {
      id: randomUUID(),
      title: body.title,
      content: body.content ?? '',
      url: null,
      upvotes: 0,
      downvotes: 0,
      comment_count: 0,
      created_at: new Date().toISOString(),
      author: { id: agent.id, name: agent.name },
      submolt,
    };

    this.posts.set(post.id, post);
    this.comments.set(post.id, []);
    this.votes.set(post.id, new Map());

    return { success: true, post };
  }

  /** GET /api/v1/posts/:id/comments */
  listComments(apiKey: string, postId: string): ListCommentsResponse | ErrorResponse {
    const agent = this.auth(apiKey);
    if ('error' in agent) return agent;

    const rlError = this.rateCheck(agent.id, 'GET /posts/:id/comments');
    if (rlError) return rlError;

    if (!this.posts.has(postId)) {
      return { success: false, error: 'Post not found', code: 404 };
    }

    const comments = this.comments.get(postId) ?? [];

    return {
      success: true,
      comments,
      count: comments.length,
    };
  }

  /** POST /api/v1/posts/:id/comments */
  createComment(
    apiKey: string,
    postId: string,
    body: { content: string }
  ): CommentResponse | ErrorResponse {
    const agent = this.auth(apiKey);
    if ('error' in agent) return agent;

    const rlError = this.rateCheck(agent.id, 'POST /posts/:id/comments');
    if (rlError) return rlError;

    if (!this.posts.has(postId)) {
      return { success: false, error: 'Post not found', code: 404 };
    }

    if (!body.content || body.content.length === 0) {
      return { success: false, error: 'Content is required', code: 400 };
    }
    if (body.content.length > CONTENT_LIMITS.comment_content_max) {
      return { success: false, error: `Content exceeds ${CONTENT_LIMITS.comment_content_max} characters`, code: 400 };
    }

    const comment: MoltbookComment = {
      id: randomUUID(),
      content: body.content,
      upvotes: 0,
      downvotes: 0,
      created_at: new Date().toISOString(),
      author: { id: agent.id, name: agent.name },
      post_id: postId,
    };

    const postComments = this.comments.get(postId) ?? [];
    postComments.push(comment);
    this.comments.set(postId, postComments);

    // Update post comment count
    const post = this.posts.get(postId)!;
    post.comment_count = postComments.length;

    return { success: true, comment };
  }

  /** POST /api/v1/posts/:id/vote */
  vote(
    apiKey: string,
    postId: string,
    body: { direction: 'up' | 'down' }
  ): VoteResponse | ErrorResponse {
    const agent = this.auth(apiKey);
    if ('error' in agent) return agent;

    const rlError = this.rateCheck(agent.id, 'POST /posts/:id/vote');
    if (rlError) return rlError;

    const post = this.posts.get(postId);
    if (!post) {
      return { success: false, error: 'Post not found', code: 404 };
    }

    const postVotes = this.votes.get(postId) ?? new Map();
    const existingVote = postVotes.get(agent.id);

    // Remove existing vote if any
    if (existingVote === 'up') post.upvotes--;
    if (existingVote === 'down') post.downvotes--;

    // Toggle: if same direction, remove vote. Otherwise, apply new vote.
    if (existingVote === body.direction) {
      postVotes.delete(agent.id);
    } else {
      postVotes.set(agent.id, body.direction);
      if (body.direction === 'up') post.upvotes++;
      if (body.direction === 'down') post.downvotes++;
    }

    this.votes.set(postId, postVotes);

    return {
      success: true,
      upvotes: post.upvotes,
      downvotes: post.downvotes,
    };
  }

  // ── Test Utilities ──

  /** Get all registered agents. */
  getAgents(): MoltbookAgent[] {
    return Array.from(this.agents.values());
  }

  /** Get agent by name. */
  getAgentByName(name: string): MoltbookAgent | undefined {
    return Array.from(this.agents.values()).find((a) => a.name === name);
  }

  /** Get agent balance. */
  getBalance(apiKey: string): number | null {
    const agent = this.agents.get(apiKey);
    return agent?.balance ?? null;
  }

  /** Set agent balance (for testing bid flows). */
  setBalance(apiKey: string, amount: number): boolean {
    const agent = this.agents.get(apiKey);
    if (!agent) return false;
    agent.balance = amount;
    return true;
  }

  /** Get total post count. */
  postCount(): number {
    return this.posts.size;
  }

  /** Get total comment count across all posts. */
  commentCount(): number {
    let total = 0;
    for (const comments of Array.from(this.comments.values())) {
      total += comments.length;
    }
    return total;
  }

  /** Clear all data (posts, comments, votes). Keeps agents. */
  clearContent(): void {
    this.posts.clear();
    this.comments.clear();
    this.votes.clear();
  }

  /** Full reset — everything including agents. */
  reset(): void {
    this.clearContent();
    this.agents.clear();
    this.rateLimiter.reset();
  }

  /** Get rate limiter for direct inspection/config changes. */
  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  /** Toggle rate limiting on/off. */
  setRateLimiting(config: RateLimitConfig): void {
    this.rateLimiter.setConfig(config);
  }
}
