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
    update: vi.fn().mockReturnThis(),
  };
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => mockFrom(...args),
  },
}));

// Mock env var for GM secret
vi.stubEnv('GM_API_SECRET', 'test-gm-secret');

function makeReq(url: string, opts: RequestInit = {}) {
  return new Request(url, opts) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/gm/pods/[id]/publish', () => {
  it('publishes in mock mode when no moltbook_post_id', async () => {
    const { POST } = await import('@/app/api/gm/pods/[id]/publish/route');

    const pod = { 
      id: 'pod-1', 
      pod_number: 1, 
      moltbook_post_id: null, 
      moltbook_mode: 'mock' 
    };

    mockFrom.mockImplementation((table: string) => {
      const c = chainable();
      if (table === 'game_pods') {
        c.single.mockResolvedValue({ data: pod, error: null });
      } else if (table === 'gm_events') {
        c.insert.mockResolvedValue({ data: null, error: null });
      }
      return c;
    });

    const res = await POST(
      makeReq('http://localhost/api/gm/pods/pod-1/publish', {
        method: 'POST',
        headers: { 'x-gm-secret': 'test-gm-secret', 'content-type': 'application/json' },
        body: JSON.stringify({
          content: 'The boil meter rises!',
        }),
      }),
      { params: Promise.resolve({ id: 'pod-1' }) }
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.mock).toBe(true);
  });

  it('rejects without GM secret', async () => {
    const { POST } = await import('@/app/api/gm/pods/[id]/publish/route');

    const res = await POST(
      makeReq('http://localhost/api/gm/pods/pod-1/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'test' }),
      }),
      { params: Promise.resolve({ id: 'pod-1' }) }
    );
    expect(res.status).toBe(401);
  });

  it('rejects missing content', async () => {
    const { POST } = await import('@/app/api/gm/pods/[id]/publish/route');

    const res = await POST(
      makeReq('http://localhost/api/gm/pods/pod-1/publish', {
        method: 'POST',
        headers: { 'x-gm-secret': 'test-gm-secret', 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'only title, no content' }),
      }),
      { params: Promise.resolve({ id: 'pod-1' }) }
    );
    expect(res.status).toBe(400);
  });
});
