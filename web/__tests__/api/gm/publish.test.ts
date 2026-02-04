import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();

function chainable() {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
  };
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => mockFrom(...args),
  },
}));

const mockRequireGmAuth = vi.fn();
vi.mock('@/lib/api/gm-auth', () => ({
  requireGmAuth: (...args: any[]) => mockRequireGmAuth(...args),
}));

function makeReq(url: string, opts: RequestInit = {}) {
  return new Request(url, opts) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireGmAuth.mockReturnValue(null);
});

describe('POST /api/gm/pods/[id]/publish', () => {
  it('creates a Moltbook post when given title and content', async () => {
    const { POST } = await import('@/app/api/gm/pods/[id]/publish/route');

    const pod = { id: 'pod-1', pod_number: 1, status: 'active', current_phase: 'day', current_round: 2 };
    const gmAgent = { id: 'gm-agent', name: 'MoltMob_GM' };
    const submolt = { id: 'sub-mm' };
    const post = { id: 'post-1', title: '🦀 Round 2 Update', created_at: '2026-01-01' };

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      const c = chainable();

      if (table === 'game_pods') {
        c.single.mockResolvedValue({ data: pod, error: null });
      } else if (table === 'agents') {
        c.single.mockResolvedValue({ data: gmAgent, error: null });
      } else if (table === 'submolts') {
        c.single.mockResolvedValue({ data: submolt, error: null });
      } else if (table === 'posts') {
        c.single.mockResolvedValue({ data: post, error: null });
      } else if (table === 'gm_events') {
        c.insert.mockResolvedValue({ data: null, error: null });
      }
      return c;
    });

    const res = await POST(
      makeReq('http://localhost/api/gm/pods/pod-1/publish', {
        method: 'POST',
        headers: { 'x-gm-secret': 'test', 'content-type': 'application/json' },
        body: JSON.stringify({
          title: '🦀 Round 2 Update',
          content: 'The boil meter rises!',
          event_type: 'announcement',
        }),
      }),
      { params: { id: 'pod-1' } }
    );
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.post.submolt).toBe('moltmob');
  });

  it('rejects without GM secret', async () => {
    const { NextResponse } = require('next/server');
    mockRequireGmAuth.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const { POST } = await import('@/app/api/gm/pods/[id]/publish/route');

    const res = await POST(
      makeReq('http://localhost/api/gm/pods/pod-1/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'test', content: 'test' }),
      }),
      { params: { id: 'pod-1' } }
    );
    expect(res.status).toBe(401);
  });

  it('rejects missing title or content', async () => {
    const { POST } = await import('@/app/api/gm/pods/[id]/publish/route');

    const res = await POST(
      makeReq('http://localhost/api/gm/pods/pod-1/publish', {
        method: 'POST',
        headers: { 'x-gm-secret': 'test', 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'only title' }),
      }),
      { params: { id: 'pod-1' } }
    );
    expect(res.status).toBe(400);
  });
});
