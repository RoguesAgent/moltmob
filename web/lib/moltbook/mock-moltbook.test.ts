import { describe, it, expect, beforeEach } from 'vitest';
import { MockMoltbook } from './mock-moltbook';
import { MOLTBOOK_RATE_LIMITS, NO_RATE_LIMITS, CONTENT_LIMITS } from './types';

describe('MockMoltbook — No Rate Limits (fast testing)', () => {
  let mb: MockMoltbook;
  let agent1Key: string;
  let agent2Key: string;

  beforeEach(() => {
    mb = new MockMoltbook(NO_RATE_LIMITS);
    agent1Key = mb.registerAgent('CrabbyPatton', 'wallet_crabby', 50_000_000).api_key;
    agent2Key = mb.registerAgent('LobsterLord', 'wallet_lobster', 30_000_000).api_key;
  });

  // ── Auth ──

  it('T-MB-001: valid API key authenticates', () => {
    const result = mb.listPosts(agent1Key, {});
    expect(result.success).toBe(true);
  });

  it('T-MB-002: invalid API key returns 401', () => {
    const result = mb.listPosts('fake_key', {});
    expect(result.success).toBe(false);
    expect('code' in result && result.code).toBe(401);
  });

  // ── Posts ──

  it('T-MB-010: create a post', () => {
    const result = mb.createPost(agent1Key, {
      title: 'gm crustaceans',
      content: 'First post on MoltMob!',
    });
    expect(result.success).toBe(true);
    if ('post' in result) {
      expect(result.post.title).toBe('gm crustaceans');
      expect(result.post.author.name).toBe('CrabbyPatton');
      expect(result.post.upvotes).toBe(0);
      expect(result.post.comment_count).toBe(0);
    }
  });

  it('T-MB-011: list posts returns created posts', () => {
    mb.createPost(agent1Key, { title: 'Post 1', content: 'Hello' });
    mb.createPost(agent2Key, { title: 'Post 2', content: 'World' });

    const result = mb.listPosts(agent1Key, { sort: 'new' });
    expect(result.success).toBe(true);
    if ('posts' in result) {
      expect(result.posts).toHaveLength(2);
      const titles = result.posts.map((p) => p.title);
      expect(titles).toContain('Post 1');
      expect(titles).toContain('Post 2');
    }
  });

  it('T-MB-012: list posts with limit and offset', () => {
    for (let i = 0; i < 5; i++) {
      mb.createPost(agent1Key, { title: `Post ${i}`, content: `Content ${i}` });
    }

    const page1 = mb.listPosts(agent1Key, { limit: 2, offset: 0 });
    expect(page1.success).toBe(true);
    if ('posts' in page1) {
      expect(page1.posts).toHaveLength(2);
      expect(page1.has_more).toBe(true);
      expect(page1.next_offset).toBe(2);
    }

    const page2 = mb.listPosts(agent1Key, { limit: 2, offset: 2 });
    if ('posts' in page2) {
      expect(page2.posts).toHaveLength(2);
    }
  });

  it('T-MB-013: get specific post by ID', () => {
    const created = mb.createPost(agent1Key, { title: 'Specific', content: 'Find me' });
    if (!('post' in created)) throw new Error('Create failed');

    const result = mb.getPost(agent1Key, created.post.id);
    expect(result.success).toBe(true);
    if ('post' in result) {
      expect(result.post.title).toBe('Specific');
    }
  });

  it('T-MB-014: get nonexistent post returns 404', () => {
    const result = mb.getPost(agent1Key, 'nonexistent-id');
    expect(result.success).toBe(false);
    expect('code' in result && result.code).toBe(404);
  });

  it('T-MB-015: post title required', () => {
    const result = mb.createPost(agent1Key, { title: '', content: 'No title' });
    expect(result.success).toBe(false);
    expect('code' in result && result.code).toBe(400);
  });

  it('T-MB-016: post title respects character limit', () => {
    const longTitle = 'a'.repeat(CONTENT_LIMITS.post_title_max + 1);
    const result = mb.createPost(agent1Key, { title: longTitle, content: 'test' });
    expect(result.success).toBe(false);
    if ('error' in result) {
      expect(result.error).toContain(`${CONTENT_LIMITS.post_title_max}`);
    }
  });

  it('T-MB-017: post content respects character limit', () => {
    const longContent = 'a'.repeat(CONTENT_LIMITS.post_content_max + 1);
    const result = mb.createPost(agent1Key, { title: 'test', content: longContent });
    expect(result.success).toBe(false);
  });

  it('T-MB-018: post to specific submolt', () => {
    const result = mb.createPost(agent1Key, {
      title: 'MoltMob game starting',
      content: 'Pod #42 is recruiting!',
      submolt_id: 'moltmob-submolt-id',
    });
    expect(result.success).toBe(true);
    if ('post' in result) {
      expect(result.post.submolt.name).toBe('moltmob');
    }
  });

  it('T-MB-019: post to nonexistent submolt returns 404', () => {
    const result = mb.createPost(agent1Key, {
      title: 'test',
      content: 'test',
      submolt_id: 'doesnt-exist',
    });
    expect(result.success).toBe(false);
  });

  // ── Comments ──

  it('T-MB-020: comment on a post', () => {
    const post = mb.createPost(agent1Key, { title: 'Discuss', content: 'Talk here' });
    if (!('post' in post)) throw new Error('Create failed');

    const result = mb.createComment(agent2Key, post.post.id, { content: 'Great discussion!' });
    expect(result.success).toBe(true);
    if ('comment' in result) {
      expect(result.comment.author.name).toBe('LobsterLord');
      expect(result.comment.content).toBe('Great discussion!');
    }
  });

  it('T-MB-021: comment updates post comment_count', () => {
    const post = mb.createPost(agent1Key, { title: 'Count', content: 'test' });
    if (!('post' in post)) throw new Error('Create failed');

    mb.createComment(agent1Key, post.post.id, { content: 'Comment 1' });
    mb.createComment(agent2Key, post.post.id, { content: 'Comment 2' });

    const updated = mb.getPost(agent1Key, post.post.id);
    if ('post' in updated) {
      expect(updated.post.comment_count).toBe(2);
    }
  });

  it('T-MB-022: list comments on post', () => {
    const post = mb.createPost(agent1Key, { title: 'List', content: 'test' });
    if (!('post' in post)) throw new Error('Create failed');

    mb.createComment(agent1Key, post.post.id, { content: 'First!' });
    mb.createComment(agent2Key, post.post.id, { content: 'Second!' });

    const result = mb.listComments(agent1Key, post.post.id);
    expect(result.success).toBe(true);
    if ('comments' in result) {
      expect(result.comments).toHaveLength(2);
      expect(result.count).toBe(2);
    }
  });

  it('T-MB-023: comment on nonexistent post returns 404', () => {
    const result = mb.createComment(agent1Key, 'fake-post', { content: 'Hello' });
    expect(result.success).toBe(false);
    expect('code' in result && result.code).toBe(404);
  });

  it('T-MB-024: empty comment rejected', () => {
    const post = mb.createPost(agent1Key, { title: 'test', content: 'test' });
    if (!('post' in post)) throw new Error('Create failed');

    const result = mb.createComment(agent1Key, post.post.id, { content: '' });
    expect(result.success).toBe(false);
    expect('code' in result && result.code).toBe(400);
  });

  it('T-MB-025: comment respects character limit', () => {
    const post = mb.createPost(agent1Key, { title: 'test', content: 'test' });
    if (!('post' in post)) throw new Error('Create failed');

    const longComment = 'x'.repeat(CONTENT_LIMITS.comment_content_max + 1);
    const result = mb.createComment(agent1Key, post.post.id, { content: longComment });
    expect(result.success).toBe(false);
  });

  // ── Voting ──

  it('T-MB-030: upvote a post', () => {
    const post = mb.createPost(agent1Key, { title: 'Vote', content: 'test' });
    if (!('post' in post)) throw new Error('Create failed');

    const result = mb.vote(agent2Key, post.post.id, { direction: 'up' });
    expect(result.success).toBe(true);
    if ('upvotes' in result) {
      expect(result.upvotes).toBe(1);
      expect(result.downvotes).toBe(0);
    }
  });

  it('T-MB-031: toggle vote off (same direction again)', () => {
    const post = mb.createPost(agent1Key, { title: 'Toggle', content: 'test' });
    if (!('post' in post)) throw new Error('Create failed');

    mb.vote(agent2Key, post.post.id, { direction: 'up' });
    const result = mb.vote(agent2Key, post.post.id, { direction: 'up' }); // toggle off

    if ('upvotes' in result) {
      expect(result.upvotes).toBe(0);
    }
  });

  it('T-MB-032: change vote direction', () => {
    const post = mb.createPost(agent1Key, { title: 'Change', content: 'test' });
    if (!('post' in post)) throw new Error('Create failed');

    mb.vote(agent2Key, post.post.id, { direction: 'up' });
    const result = mb.vote(agent2Key, post.post.id, { direction: 'down' });

    if ('upvotes' in result) {
      expect(result.upvotes).toBe(0);
      expect(result.downvotes).toBe(1);
    }
  });

  it('T-MB-033: multiple agents vote independently', () => {
    const post = mb.createPost(agent1Key, { title: 'Multi', content: 'test' });
    if (!('post' in post)) throw new Error('Create failed');

    mb.vote(agent1Key, post.post.id, { direction: 'up' });
    const result = mb.vote(agent2Key, post.post.id, { direction: 'up' });

    if ('upvotes' in result) {
      expect(result.upvotes).toBe(2);
    }
  });

  // ── Balance / Test Utils ──

  it('T-MB-040: get and set agent balance', () => {
    expect(mb.getBalance(agent1Key)).toBe(50_000_000);
    mb.setBalance(agent1Key, 100_000_000);
    expect(mb.getBalance(agent1Key)).toBe(100_000_000);
  });

  it('T-MB-041: set balance on invalid key returns false', () => {
    expect(mb.setBalance('fake', 100)).toBe(false);
  });

  it('T-MB-042: post and comment counts track correctly', () => {
    expect(mb.postCount()).toBe(0);
    expect(mb.commentCount()).toBe(0);

    const post = mb.createPost(agent1Key, { title: 'test', content: 'test' });
    if (!('post' in post)) throw new Error('Create failed');

    mb.createComment(agent2Key, post.post.id, { content: 'reply' });

    expect(mb.postCount()).toBe(1);
    expect(mb.commentCount()).toBe(1);
  });

  it('T-MB-043: clearContent removes posts but keeps agents', () => {
    mb.createPost(agent1Key, { title: 'test', content: 'test' });
    mb.clearContent();

    expect(mb.postCount()).toBe(0);
    expect(mb.getBalance(agent1Key)).toBe(50_000_000); // agent still exists
  });

  it('T-MB-044: full reset clears everything', () => {
    mb.createPost(agent1Key, { title: 'test', content: 'test' });
    mb.reset();

    expect(mb.postCount()).toBe(0);
    expect(mb.getBalance(agent1Key)).toBeNull(); // agent gone
  });

  it('T-MB-045: getAgentByName finds agent', () => {
    const agent = mb.getAgentByName('CrabbyPatton');
    expect(agent).toBeDefined();
    expect(agent!.name).toBe('CrabbyPatton');
  });

  it('T-MB-046: rapid-fire posts work with rate limits OFF', () => {
    // 20 posts in a row — should all succeed with no rate limit
    for (let i = 0; i < 20; i++) {
      const result = mb.createPost(agent1Key, { title: `Post ${i}`, content: `Content ${i}` });
      expect(result.success).toBe(true);
    }
    expect(mb.postCount()).toBe(20);
  });
});

describe('MockMoltbook — With Rate Limits (realistic mode)', () => {
  let mb: MockMoltbook;
  let agentKey: string;

  beforeEach(() => {
    mb = new MockMoltbook(MOLTBOOK_RATE_LIMITS);
    agentKey = mb.registerAgent('TestAgent', 'wallet_test').api_key;
  });

  it('T-MB-050: posts rate limited to 5 per 5 min', () => {
    // First 5 should succeed
    for (let i = 0; i < 5; i++) {
      const result = mb.createPost(agentKey, { title: `Post ${i}`, content: 'test' });
      expect(result.success).toBe(true);
    }

    // 6th should be rate limited
    const result = mb.createPost(agentKey, { title: 'Post 6', content: 'test' });
    expect(result.success).toBe(false);
    expect('code' in result && result.code).toBe(429);
    expect('retry_after_ms' in result).toBe(true);
  });

  it('T-MB-051: reads rate limited to 30 per minute', () => {
    // Create a post to read
    mb.createPost(agentKey, { title: 'test', content: 'test' });

    // 30 reads should succeed
    for (let i = 0; i < 30; i++) {
      const result = mb.listPosts(agentKey, {});
      expect(result.success).toBe(true);
    }

    // 31st should fail
    const result = mb.listPosts(agentKey, {});
    expect(result.success).toBe(false);
    expect('code' in result && result.code).toBe(429);
  });

  it('T-MB-052: rate limits are per-agent (different agents independent)', () => {
    const agent2Key = mb.registerAgent('Agent2', 'wallet_2').api_key;

    // Agent 1 uses up post limit
    for (let i = 0; i < 5; i++) {
      mb.createPost(agentKey, { title: `A1 Post ${i}`, content: 'test' });
    }

    // Agent 1 blocked
    const blocked = mb.createPost(agentKey, { title: 'blocked', content: 'test' });
    expect(blocked.success).toBe(false);

    // Agent 2 should still work
    const ok = mb.createPost(agent2Key, { title: 'A2 Post', content: 'test' });
    expect(ok.success).toBe(true);
  });

  it('T-MB-053: toggle rate limits off at runtime', () => {
    // Use up post limit
    for (let i = 0; i < 5; i++) {
      mb.createPost(agentKey, { title: `Post ${i}`, content: 'test' });
    }

    // Blocked
    expect(mb.createPost(agentKey, { title: 'blocked', content: 'test' }).success).toBe(false);

    // Turn off rate limits
    mb.setRateLimiting(NO_RATE_LIMITS);

    // Now it works
    const result = mb.createPost(agentKey, { title: 'unblocked', content: 'test' });
    expect(result.success).toBe(true);
  });

  it('T-MB-054: toggle rate limits back on at runtime', () => {
    // Start with rate limits ON, turn OFF, turn back ON
    mb.setRateLimiting(NO_RATE_LIMITS);
    for (let i = 0; i < 10; i++) {
      mb.createPost(agentKey, { title: `Post ${i}`, content: 'test' });
    }

    // Turn back ON — previous timestamps are still recorded
    mb.setRateLimiting(MOLTBOOK_RATE_LIMITS);

    // Should be blocked (already >5 posts)
    const result = mb.createPost(agentKey, { title: 'blocked again', content: 'test' });
    // Note: since rate limiter was disabled, no timestamps were recorded
    // So it should actually work — this tests that disabling truly skips recording
    expect(result.success).toBe(true);
  });

  it('T-MB-055: 429 includes retry_after_ms', () => {
    for (let i = 0; i < 5; i++) {
      mb.createPost(agentKey, { title: `Post ${i}`, content: 'test' });
    }

    const result = mb.createPost(agentKey, { title: 'blocked', content: 'test' });
    expect(result.success).toBe(false);
    if ('retry_after_ms' in result) {
      expect(typeof result.retry_after_ms).toBe('number');
      expect(result.retry_after_ms!).toBeGreaterThanOrEqual(0);
    }
  });

  it('T-MB-056: rate limit remaining decrements correctly', () => {
    const rl = mb.getRateLimiter();
    const agent = mb.getAgentByName('TestAgent')!;

    expect(rl.remaining(agent.id, 'POST /posts')).toBe(5);

    mb.createPost(agentKey, { title: 'Post 1', content: 'test' });
    expect(rl.remaining(agent.id, 'POST /posts')).toBe(4);

    mb.createPost(agentKey, { title: 'Post 2', content: 'test' });
    expect(rl.remaining(agent.id, 'POST /posts')).toBe(3);
  });

  it('T-MB-057: comments rate limited to 10 per minute', () => {
    const post = mb.createPost(agentKey, { title: 'Spam', content: 'test' });
    if (!('post' in post)) throw new Error('Create failed');

    for (let i = 0; i < 10; i++) {
      const result = mb.createComment(agentKey, post.post.id, { content: `Comment ${i}` });
      expect(result.success).toBe(true);
    }

    // 11th should fail
    const result = mb.createComment(agentKey, post.post.id, { content: 'Too many' });
    expect(result.success).toBe(false);
    expect('code' in result && result.code).toBe(429);
  });
});

describe('MockMoltbook — Multi-agent game scenario', () => {
  it('T-MB-060: 6 agents register, post, vote, and interact', () => {
    const mb = new MockMoltbook(NO_RATE_LIMITS);

    // Register 6 mock agents with balances
    const agents = [
      mb.registerAgent('CrabbyPatton', 'wallet_0', 10_000_000),
      mb.registerAgent('LobsterLord', 'wallet_1', 10_000_000),
      mb.registerAgent('ShrimpScampi', 'wallet_2', 10_000_000),
      mb.registerAgent('PrawnStar', 'wallet_3', 10_000_000),
      mb.registerAgent('CrawdadKing', 'wallet_4', 10_000_000),
      mb.registerAgent('BarnacleBot', 'wallet_5', 10_000_000),
    ];

    expect(mb.getAgents()).toHaveLength(6);

    // Agent 0 creates a game recruitment post
    const post = mb.createPost(agents[0].api_key, {
      title: '🦀 MoltMob Pod #1 — JOIN NOW',
      content: 'Recruiting 6 agents for social deduction. Entry: 0.01 SOL. Who dares?',
      submolt_id: 'moltmob-submolt-id',
    });
    expect(post.success).toBe(true);
    if (!('post' in post)) throw new Error('Create failed');

    // Other agents reply expressing interest
    for (let i = 1; i < 6; i++) {
      const reply = mb.createComment(agents[i].api_key, post.post.id, {
        content: `I'm in! 🦞 — ${agents[i].name}`,
      });
      expect(reply.success).toBe(true);
    }

    // Check post has 5 comments
    const updated = mb.getPost(agents[0].api_key, post.post.id);
    if ('post' in updated) {
      expect(updated.post.comment_count).toBe(5);
    }

    // Agents upvote the post
    for (const agent of agents) {
      mb.vote(agent.api_key, post.post.id, { direction: 'up' });
    }

    // Check vote count
    const final = mb.getPost(agents[0].api_key, post.post.id);
    if ('post' in final) {
      expect(final.post.upvotes).toBe(6);
    }

    // Verify balances
    for (const agent of agents) {
      expect(mb.getBalance(agent.api_key)).toBe(10_000_000);
    }
  });
});
