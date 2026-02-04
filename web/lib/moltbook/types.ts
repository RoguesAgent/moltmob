// ── Mock Moltbook Types ──
// Mirrors real Moltbook API shapes

export interface MoltbookAuthor {
  id: string;
  name: string;
}

export interface MoltbookSubmolt {
  id: string;
  name: string;
  display_name: string;
}

export interface MoltbookPost {
  id: string;
  title: string;
  content: string;
  url: string | null;
  upvotes: number;
  downvotes: number;
  comment_count: number;
  created_at: string; // ISO8601
  author: MoltbookAuthor;
  submolt: MoltbookSubmolt;
}

export interface MoltbookComment {
  id: string;
  content: string;
  upvotes: number;
  downvotes: number;
  created_at: string;
  author: MoltbookAuthor;
  post_id: string;
}

export interface MoltbookAgent {
  id: string;
  name: string;
  api_key: string;
  wallet_pubkey: string;
  balance: number; // lamports — for testing bid flows
  created_at: string;
}

// ── Rate Limit Config ──

export interface RateLimitConfig {
  enabled: boolean;
  // Per-endpoint limits (requests per window)
  limits: {
    'GET /posts': RateLimitRule;
    'GET /posts/:id': RateLimitRule;
    'POST /posts': RateLimitRule;
    'GET /posts/:id/comments': RateLimitRule;
    'POST /posts/:id/comments': RateLimitRule;
    'POST /posts/:id/vote': RateLimitRule;
  };
}

export interface RateLimitRule {
  max_requests: number;
  window_ms: number; // sliding window in milliseconds
}

export interface RateLimitState {
  timestamps: number[]; // request timestamps within window
}

// ── API Responses (mirrors real Moltbook) ──

export interface ListPostsResponse {
  success: boolean;
  posts: MoltbookPost[];
  count: number;
  has_more: boolean;
  next_offset: number;
}

export interface PostResponse {
  success: boolean;
  post: MoltbookPost;
}

export interface CommentResponse {
  success: boolean;
  comment: MoltbookComment;
}

export interface ListCommentsResponse {
  success: boolean;
  comments: MoltbookComment[];
  count: number;
}

export interface VoteResponse {
  success: boolean;
  upvotes: number;
  downvotes: number;
}

export interface ErrorResponse {
  success: false;
  error: string;
  code: number;
  retry_after_ms?: number; // present on 429
}

// ── Presets ──

/** Real Moltbook rate limits (estimated from observed behavior) */
export const MOLTBOOK_RATE_LIMITS: RateLimitConfig = {
  enabled: true,
  limits: {
    'GET /posts': { max_requests: 30, window_ms: 60_000 },
    'GET /posts/:id': { max_requests: 60, window_ms: 60_000 },
    'POST /posts': { max_requests: 5, window_ms: 300_000 }, // 5 per 5 min
    'GET /posts/:id/comments': { max_requests: 30, window_ms: 60_000 },
    'POST /posts/:id/comments': { max_requests: 10, window_ms: 60_000 },
    'POST /posts/:id/vote': { max_requests: 20, window_ms: 60_000 },
  },
};

/** No rate limits — for fast testing */
export const NO_RATE_LIMITS: RateLimitConfig = {
  enabled: false,
  limits: {
    'GET /posts': { max_requests: Infinity, window_ms: 0 },
    'GET /posts/:id': { max_requests: Infinity, window_ms: 0 },
    'POST /posts': { max_requests: Infinity, window_ms: 0 },
    'GET /posts/:id/comments': { max_requests: Infinity, window_ms: 0 },
    'POST /posts/:id/comments': { max_requests: Infinity, window_ms: 0 },
    'POST /posts/:id/vote': { max_requests: Infinity, window_ms: 0 },
  },
};

/** Content limits (matches real Moltbook) */
export const CONTENT_LIMITS = {
  post_title_max: 300,
  post_content_max: 10_000,
  comment_content_max: 5_000,
};
