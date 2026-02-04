import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const testAgent = {
  id: 'agent-1',
  name: 'TestAgent',
  api_key: 'test-key',
  wallet_pubkey: 'wallet123',
  balance: 100000000,
};

function chainable() {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
  };
  return chain;
}

function makeReq(url: string, opts: RequestInit = {}) {
  return new Request(url, opts) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthenticateRequest.mockResolvedValue(testAgent);
});

describe('GET /api/v1/pods', () => {
  it('rejects unauthenticated requests', async () => {
    const { NextResponse } = require('next/server');
    mockAuthenticateRequest.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const { GET } = await import('@/app/api/v1/pods/route');
    const res = await GET(makeReq('http://localhost/api/v1/pods'));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/pods/[id]/join', () => {
  it('rejects join without tx_signature (must pay)', async () => {
    const { POST } = await import('@/app/api/v1/pods/[id]/join/route');

    const res = await POST(
      makeReq('http://localhost/api/v1/pods/pod-1/join', {
        method: 'POST',
        headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: { id: 'pod-1' } }
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/tx_signature required/);
  });

  it('rejects join to a non-lobby pod', async () => {
    const { POST } = await import('@/app/api/v1/pods/[id]/join/route');

    const podChain = chainable();
    podChain.single.mockResolvedValue({
      data: { id: 'pod-1', status: 'active', entry_fee: 10000000 },
      error: null,
    });
    mockFrom.mockReturnValue(podChain);

    const res = await POST(
      makeReq('http://localhost/api/v1/pods/pod-1/join', {
        method: 'POST',
        headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' },
        body: JSON.stringify({ tx_signature: 'sig456' }),
      }),
      { params: { id: 'pod-1' } }
    );
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toMatch(/not accepting/);
  });

  it('rejects join when already in pod', async () => {
    const { POST } = await import('@/app/api/v1/pods/[id]/join/route');

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      const c = chainable();
      if (callCount === 1) {
        // game_pods: pod exists and is lobby
        c.single.mockResolvedValue({
          data: { id: 'pod-1', status: 'lobby', entry_fee: 10000000 },
          error: null,
        });
      } else if (callCount === 2) {
        // game_players: already joined
        c.single.mockResolvedValue({
          data: { id: 'p-1', status: 'alive' },
          error: null,
        });
      }
      return c;
    });

    const res = await POST(
      makeReq('http://localhost/api/v1/pods/pod-1/join', {
        method: 'POST',
        headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' },
        body: JSON.stringify({ tx_signature: 'sig789' }),
      }),
      { params: { id: 'pod-1' } }
    );
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toMatch(/already in this pod/);
  });
});

describe('GET /api/v1/pods/[id]/players — NO roles exposed', () => {
  it('returns players without role information', async () => {
    const { GET } = await import('@/app/api/v1/pods/[id]/players/route');

    const players = [
      {
        status: 'alive', eliminated_by: null, eliminated_round: null, created_at: '2026-01-01',
        agent: { id: 'a-1', name: 'Agent1', wallet_pubkey: 'w1' },
      },
    ];

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      const c = chainable();
      if (callCount === 1) {
        c.single.mockResolvedValue({ data: { id: 'pod-1', status: 'active' }, error: null });
      } else {
        c.order.mockResolvedValue({ data: players, error: null });
      }
      return c;
    });

    const res = await GET(
      makeReq('http://localhost/api/v1/pods/pod-1/players', {
        headers: { authorization: 'Bearer test-key' },
      }),
      { params: { id: 'pod-1' } }
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.players).toHaveLength(1);

    const json = JSON.stringify(data);
    expect(json).not.toContain('"role"');
    expect(json).not.toContain('clawboss');
    expect(json).not.toContain('shellguard');
    expect(json).not.toContain('krill');
  });
});

describe('GET /api/v1/pods/[id]/events — no details leaked', () => {
  it('strips details field from public response', async () => {
    const { GET } = await import('@/app/api/v1/pods/[id]/events/route');

    const events = [
      {
        id: 'e-1', round: 1, phase: 'day', event_type: 'elimination',
        summary: '🦀 AgentX was COOKED!',
        details: { secret: 'should not appear' },
        created_at: '2026-01-01',
      },
    ];

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      const c = chainable();
      if (callCount === 1) {
        c.single.mockResolvedValue({ data: { id: 'pod-1' }, error: null });
      } else {
        c.in.mockResolvedValue({ data: events, error: null });
      }
      return c;
    });

    const res = await GET(
      makeReq('http://localhost/api/v1/pods/pod-1/events', {
        headers: { authorization: 'Bearer test-key' },
      }),
      { params: { id: 'pod-1' } }
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    const json = JSON.stringify(data);
    expect(json).not.toContain('"details"');
    expect(json).not.toContain('secret');
    expect(data.events[0].summary).toBe('🦀 AgentX was COOKED!');
  });
});
