import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Access Control Tests
 * 
 * Verifies the three-tier access model:
 * 
 * TIER 1 — Public API (Bearer {agent_api_key})
 *   - /api/v1/pods, /api/v1/pods/[id], /api/v1/pods/[id]/join
 *   - /api/v1/pods/[id]/players (NO roles), /api/v1/pods/[id]/events (no details)
 * 
 * TIER 2 — Admin API (x-admin-secret) — read-only dashboard
 * 
 * TIER 3 — GM API (x-gm-secret) — full read/write, private roles
 */

const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => mockFrom(...args),
  },
}));

const mockAuthenticateRequest = vi.fn();
vi.mock('@/lib/api/auth', () => ({
  authenticateRequest: (...args: any[]) => mockAuthenticateRequest(...args),
  errorResponse: (msg: string, code: number) => {
    const { NextResponse } = require('next/server');
    return NextResponse.json({ success: false, error: msg, code }, { status: code });
  },
}));

const mockRequireGmAuth = vi.fn();
vi.mock('@/lib/api/gm-auth', () => ({
  requireGmAuth: (...args: any[]) => mockRequireGmAuth(...args),
}));

const testAgent = {
  id: 'agent-1',
  name: 'TestAgent',
  api_key: 'test-key',
  wallet_pubkey: 'wallet123',
  balance: 100000000,
};

function chainable(resolveData: any = null) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: resolveData, error: resolveData ? null : { code: 'PGRST116' } }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };
  return chain;
}

function makeReq(url: string, opts: RequestInit = {}) {
  return new Request(url, opts) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthenticateRequest.mockResolvedValue(testAgent);
  mockRequireGmAuth.mockReturnValue(null);
});

describe('Access Tier Enforcement', () => {
  describe('Public API (/api/v1) requires Bearer auth', () => {
    it('rejects /api/v1/pods without Bearer token', async () => {
      const { NextResponse } = require('next/server');
      mockAuthenticateRequest.mockResolvedValue(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );

      const { GET } = await import('@/app/api/v1/pods/route');
      const res = await GET(makeReq('http://localhost/api/v1/pods'));
      expect(res.status).toBe(401);
    });

    it('rejects /api/v1/pods/[id]/join without Bearer token', async () => {
      const { NextResponse } = require('next/server');
      mockAuthenticateRequest.mockResolvedValue(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );

      const { POST } = await import('@/app/api/v1/pods/[id]/join/route');
      const res = await POST(
        makeReq('http://localhost/api/v1/pods/pod-1/join', {
          method: 'POST',
          body: JSON.stringify({ tx_signature: 'sig123' }),
        }),
        { params: { id: 'pod-1' } }
      );
      expect(res.status).toBe(401);
    });
  });

  describe('GM API (/api/gm) requires GM secret', () => {
    it('rejects /api/gm/pods without x-gm-secret', async () => {
      const { NextResponse } = require('next/server');
      mockRequireGmAuth.mockReturnValue(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );

      const { GET } = await import('@/app/api/gm/pods/route');
      const res = await GET(makeReq('http://localhost/api/gm/pods'));
      expect(res.status).toBe(401);
    });

    it('rejects /api/gm/pods/[id]/players without x-gm-secret', async () => {
      const { NextResponse } = require('next/server');
      mockRequireGmAuth.mockReturnValue(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );

      const { GET } = await import('@/app/api/gm/pods/[id]/players/route');
      const res = await GET(
        makeReq('http://localhost/api/gm/pods/pod-1/players'),
        { params: { id: 'pod-1' } }
      );
      expect(res.status).toBe(401);
    });

    it('rejects /api/gm/pods/[id]/publish without x-gm-secret', async () => {
      const { NextResponse } = require('next/server');
      mockRequireGmAuth.mockReturnValue(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );

      const { POST } = await import('@/app/api/gm/pods/[id]/publish/route');
      const res = await POST(
        makeReq('http://localhost/api/gm/pods/pod-1/publish', {
          method: 'POST',
          body: JSON.stringify({ title: 'test', content: 'test' }),
        }),
        { params: { id: 'pod-1' } }
      );
      expect(res.status).toBe(401);
    });
  });

  describe('Data isolation between tiers', () => {
    it('public player API never leaks role', async () => {
      const { GET } = await import('@/app/api/v1/pods/[id]/players/route');

      const podChain = chainable({ id: 'pod-1', status: 'active' });
      const playersChain = chainable();
      playersChain.order.mockResolvedValue({
        data: [
          {
            status: 'alive',
            eliminated_by: null,
            eliminated_round: null,
            created_at: '2026-01-01',
            agent: { id: 'a-1', name: 'Agent1', wallet_pubkey: 'w1' },
          },
        ],
        error: null,
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'game_pods') return podChain;
        if (table === 'game_players') return playersChain;
        return chainable();
      });

      const res = await GET(
        makeReq('http://localhost/api/v1/pods/pod-1/players', {
          headers: { authorization: 'Bearer test-key' },
        }),
        { params: { id: 'pod-1' } }
      );
      const data = await res.json();
      const json = JSON.stringify(data);

      expect(json).not.toContain('"role"');
      expect(json).not.toContain('clawboss');
      expect(json).not.toContain('shellguard');
      expect(json).not.toContain('krill');
      expect(json).not.toContain('initiate');
    });

    it('public events API strips details field', async () => {
      const { GET } = await import('@/app/api/v1/pods/[id]/events/route');

      // Events data (route now only selects specific fields, not details)
      const eventsData = [
        {
          id: 'e-1',
          pod_id: 'pod-1',
          round: 1,
          phase: 'night',
          event_type: 'elimination',
          summary: '🦀 AgentX was eliminated!',
          created_at: '2026-01-01',
        },
      ];

      const eventsChain = chainable();
      eventsChain.order.mockResolvedValue({ data: eventsData, error: null });

      mockFrom.mockImplementation(() => eventsChain);

      const res = await GET(
        makeReq('http://localhost/api/v1/pods/pod-1/events', {
          headers: { authorization: 'Bearer test-key' },
        }),
        { params: Promise.resolve({ id: 'pod-1' }) }
      );
      const data = await res.json();
      const json = JSON.stringify(data);

      expect(json).not.toContain('"details"');
      expect(json).not.toContain('target_role');
      expect(json).not.toContain('action_by');
      expect(data.events[0].summary).toBe('🦀 AgentX was eliminated!');
    });

    it('GM players API DOES include role (for GM only)', async () => {
      // Set env var before importing - vitest resets modules between tests
      process.env.GM_API_SECRET = 'test-gm-secret';
      
      // Clear module cache to re-import with new env
      vi.resetModules();
      
      const { GET } = await import('@/app/api/gm/pods/[id]/players/route');

      const podData = { id: 'pod-1', status: 'active' };
      const playersData = [
        {
          agent_id: 'a-1',
          agent_name: 'Agent1',
          wallet_pubkey: 'w1',
          role: 'clawboss',
          status: 'alive',
          eliminated_by: null,
          eliminated_round: null,
          has_acted_this_phase: false,
        },
      ];

      mockFrom.mockImplementation((table: string) => {
        const c: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockImplementation(() => {
            if (table === 'game_pods') {
              return { single: vi.fn().mockResolvedValue({ data: podData, error: null }) };
            }
            return Promise.resolve({ data: playersData, error: null });
          }),
        };
        return c;
      });

      const res = await GET(
        makeReq('http://localhost/api/gm/pods/pod-1/players', {
          headers: { 'x-gm-secret': 'test-gm-secret' },
        }),
        { params: Promise.resolve({ id: 'pod-1' }) }
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.players[0].role).toBe('clawboss');
    });
  });

  describe('Payment required to join', () => {
    it('rejects join without tx_signature (must pay first)', async () => {
      const { POST } = await import('@/app/api/v1/pods/[id]/join/route');

      const res = await POST(
        makeReq('http://localhost/api/v1/pods/pod-1/join', {
          method: 'POST',
          headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' },
          body: JSON.stringify({ wallet_pubkey: 'myWallet' }),
        }),
        { params: { id: 'pod-1' } }
      );
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toMatch(/tx_signature required/);
    });
  });
});
