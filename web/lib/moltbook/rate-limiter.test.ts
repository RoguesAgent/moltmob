import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from './rate-limiter';
import { MOLTBOOK_RATE_LIMITS, NO_RATE_LIMITS, RateLimitConfig } from './types';

describe('RateLimiter', () => {
  let rl: RateLimiter;

  describe('Disabled mode', () => {
    beforeEach(() => {
      rl = new RateLimiter(NO_RATE_LIMITS);
    });

    it('T-RL-001: always allows when disabled', () => {
      for (let i = 0; i < 1000; i++) {
        expect(rl.consume('agent1', 'POST /posts')).toBeNull();
      }
    });

    it('T-RL-002: remaining is Infinity when disabled', () => {
      expect(rl.remaining('agent1', 'POST /posts')).toBe(Infinity);
    });

    it('T-RL-003: isEnabled returns false', () => {
      expect(rl.isEnabled()).toBe(false);
    });
  });

  describe('Enabled mode', () => {
    beforeEach(() => {
      rl = new RateLimiter(MOLTBOOK_RATE_LIMITS);
    });

    it('T-RL-010: allows up to max_requests', () => {
      const now = 1000000;
      // POST /posts: 5 per 300_000ms
      for (let i = 0; i < 5; i++) {
        expect(rl.consume('agent1', 'POST /posts', now + i)).toBeNull();
      }
    });

    it('T-RL-011: blocks after max_requests', () => {
      const now = 1000000;
      for (let i = 0; i < 5; i++) {
        rl.consume('agent1', 'POST /posts', now + i);
      }
      const result = rl.consume('agent1', 'POST /posts', now + 10);
      expect(result).not.toBeNull();
      expect(result!.code).toBe(429);
    });

    it('T-RL-012: window slides — old requests expire', () => {
      const now = 1000000;
      // Fill up at time T
      for (let i = 0; i < 5; i++) {
        rl.consume('agent1', 'POST /posts', now);
      }
      // Blocked at T+1
      expect(rl.consume('agent1', 'POST /posts', now + 1)).not.toBeNull();

      // After window passes (300_001ms later), should be allowed
      expect(rl.consume('agent1', 'POST /posts', now + 300_001)).toBeNull();
    });

    it('T-RL-013: different agents tracked separately', () => {
      const now = 1000000;
      for (let i = 0; i < 5; i++) {
        rl.consume('agent1', 'POST /posts', now);
      }
      // agent1 blocked
      expect(rl.consume('agent1', 'POST /posts', now + 1)).not.toBeNull();
      // agent2 still has quota
      expect(rl.consume('agent2', 'POST /posts', now + 1)).toBeNull();
    });

    it('T-RL-014: different endpoints tracked separately', () => {
      const now = 1000000;
      // Use up POST /posts limit (5)
      for (let i = 0; i < 5; i++) {
        rl.consume('agent1', 'POST /posts', now);
      }
      // POST /posts blocked
      expect(rl.consume('agent1', 'POST /posts', now + 1)).not.toBeNull();
      // GET /posts still has quota (30)
      expect(rl.consume('agent1', 'GET /posts', now + 1)).toBeNull();
    });

    it('T-RL-015: remaining decrements correctly', () => {
      const now = 1000000;
      expect(rl.remaining('agent1', 'POST /posts', now)).toBe(5);
      rl.consume('agent1', 'POST /posts', now);
      expect(rl.remaining('agent1', 'POST /posts', now + 1)).toBe(4);
      rl.consume('agent1', 'POST /posts', now + 1);
      expect(rl.remaining('agent1', 'POST /posts', now + 2)).toBe(3);
    });

    it('T-RL-016: retry_after_ms is positive', () => {
      const now = 1000000;
      for (let i = 0; i < 5; i++) {
        rl.consume('agent1', 'POST /posts', now);
      }
      const result = rl.consume('agent1', 'POST /posts', now + 100);
      expect(result!.retry_after_ms).toBeGreaterThan(0);
      // Should be approximately 300_000 - 100 = 299_900
      expect(result!.retry_after_ms!).toBeLessThanOrEqual(300_000);
    });

    it('T-RL-017: reset clears all state', () => {
      const now = 1000000;
      for (let i = 0; i < 5; i++) {
        rl.consume('agent1', 'POST /posts', now);
      }
      rl.reset();
      expect(rl.remaining('agent1', 'POST /posts', now + 1)).toBe(5);
    });

    it('T-RL-018: resetAgent clears specific agent', () => {
      const now = 1000000;
      for (let i = 0; i < 5; i++) {
        rl.consume('agent1', 'POST /posts', now);
        rl.consume('agent2', 'POST /posts', now);
      }
      rl.resetAgent('agent1');
      expect(rl.remaining('agent1', 'POST /posts', now + 1)).toBe(5);
      expect(rl.remaining('agent2', 'POST /posts', now + 1)).toBe(0);
    });
  });

  describe('Config swapping', () => {
    it('T-RL-020: swap from enabled to disabled at runtime', () => {
      rl = new RateLimiter(MOLTBOOK_RATE_LIMITS);
      const now = 1000000;
      for (let i = 0; i < 5; i++) {
        rl.consume('agent1', 'POST /posts', now);
      }
      expect(rl.consume('agent1', 'POST /posts', now + 1)).not.toBeNull();

      rl.setConfig(NO_RATE_LIMITS);
      expect(rl.consume('agent1', 'POST /posts', now + 2)).toBeNull();
      expect(rl.isEnabled()).toBe(false);
    });

    it('T-RL-021: swap from disabled to enabled at runtime', () => {
      rl = new RateLimiter(NO_RATE_LIMITS);
      for (let i = 0; i < 100; i++) {
        rl.consume('agent1', 'POST /posts');
      }
      // No timestamps recorded when disabled
      rl.setConfig(MOLTBOOK_RATE_LIMITS);
      expect(rl.isEnabled()).toBe(true);
      // Should have full quota (no timestamps from disabled mode)
      expect(rl.remaining('agent1', 'POST /posts')).toBe(5);
    });

    it('T-RL-022: custom rate limit config', () => {
      const custom: RateLimitConfig = {
        enabled: true,
        limits: {
          'GET /posts': { max_requests: 2, window_ms: 1000 },
          'GET /posts/:id': { max_requests: 2, window_ms: 1000 },
          'POST /posts': { max_requests: 1, window_ms: 1000 },
          'GET /posts/:id/comments': { max_requests: 2, window_ms: 1000 },
          'POST /posts/:id/comments': { max_requests: 2, window_ms: 1000 },
          'POST /posts/:id/vote': { max_requests: 2, window_ms: 1000 },
        },
      };
      rl = new RateLimiter(custom);
      const now = 1000000;

      expect(rl.consume('agent1', 'POST /posts', now)).toBeNull();
      expect(rl.consume('agent1', 'POST /posts', now + 1)).not.toBeNull(); // 2nd blocked (limit=1)
    });
  });
});
