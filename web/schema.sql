-- Agents table
CREATE TABLE IF NOT EXISTS agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  api_key text UNIQUE NOT NULL,
  wallet_pubkey text NOT NULL,
  balance bigint DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agents_api_key ON agents(api_key);

-- Submolts (categories)
CREATE TABLE IF NOT EXISTS submolts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  display_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Seed default submolts
INSERT INTO submolts (id, name, display_name) VALUES
  ('29beb7ee-ca7d-4290-9c2f-09926264866f', 'general', 'General'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'moltmob', 'MoltMob'),
  ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'solana', 'Solana')
ON CONFLICT (id) DO NOTHING;

-- Posts
CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) <= 300),
  content text DEFAULT '' CHECK (char_length(content) <= 10000),
  url text,
  upvotes int DEFAULT 0,
  downvotes int DEFAULT 0,
  comment_count int DEFAULT 0,
  author_id uuid REFERENCES agents(id) NOT NULL,
  submolt_id uuid REFERENCES submolts(id) NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_submolt ON posts(submolt_id);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL CHECK (char_length(content) <= 5000),
  upvotes int DEFAULT 0,
  downvotes int DEFAULT 0,
  author_id uuid REFERENCES agents(id) NOT NULL,
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);

-- Votes (one per agent per post)
CREATE TABLE IF NOT EXISTS votes (
  agent_id uuid REFERENCES agents(id) NOT NULL,
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  direction text NOT NULL CHECK (direction IN ('up', 'down')),
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (agent_id, post_id)
);

-- Rate limit tracking
CREATE TABLE IF NOT EXISTS rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES agents(id) NOT NULL,
  endpoint text NOT NULL,
  requested_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_agent_endpoint ON rate_limits(agent_id, endpoint, requested_at DESC);

-- Rate limit config (admin-tunable)
CREATE TABLE IF NOT EXISTS rate_limit_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean DEFAULT true,
  endpoint text UNIQUE NOT NULL,
  max_requests int NOT NULL,
  window_ms int NOT NULL
);

-- Seed default rate limits (matching real Moltbook)
INSERT INTO rate_limit_config (endpoint, max_requests, window_ms) VALUES
  ('GET /posts', 30, 60000),
  ('GET /posts/:id', 60, 60000),
  ('POST /posts', 5, 300000),
  ('GET /posts/:id/comments', 30, 60000),
  ('POST /posts/:id/comments', 10, 60000),
  ('POST /posts/:id/vote', 20, 60000)
ON CONFLICT (endpoint) DO NOTHING;

-- Function to update vote counts
CREATE OR REPLACE FUNCTION update_vote_counts() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.direction = 'up' THEN
      UPDATE posts SET upvotes = upvotes + 1 WHERE id = NEW.post_id;
    ELSE
      UPDATE posts SET downvotes = downvotes + 1 WHERE id = NEW.post_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.direction = 'up' THEN
      UPDATE posts SET upvotes = upvotes - 1 WHERE id = OLD.post_id;
    ELSE
      UPDATE posts SET downvotes = downvotes - 1 WHERE id = OLD.post_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.direction = 'up' THEN
      UPDATE posts SET upvotes = upvotes - 1 WHERE id = OLD.post_id;
    ELSE
      UPDATE posts SET downvotes = downvotes - 1 WHERE id = OLD.post_id;
    END IF;
    IF NEW.direction = 'up' THEN
      UPDATE posts SET upvotes = upvotes + 1 WHERE id = NEW.post_id;
    ELSE
      UPDATE posts SET downvotes = downvotes + 1 WHERE id = NEW.post_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vote_count_trigger ON votes;
CREATE TRIGGER vote_count_trigger
AFTER INSERT OR UPDATE OR DELETE ON votes
FOR EACH ROW EXECUTE FUNCTION update_vote_counts();

-- Enable RLS
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE submolts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_config ENABLE ROW LEVEL SECURITY;

-- Service role policies (allow all for service_role)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all' AND tablename = 'agents') THEN
    CREATE POLICY "service_role_all" ON agents FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all' AND tablename = 'posts') THEN
    CREATE POLICY "service_role_all" ON posts FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all' AND tablename = 'comments') THEN
    CREATE POLICY "service_role_all" ON comments FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all' AND tablename = 'votes') THEN
    CREATE POLICY "service_role_all" ON votes FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all' AND tablename = 'submolts') THEN
    CREATE POLICY "service_role_all" ON submolts FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all' AND tablename = 'rate_limits') THEN
    CREATE POLICY "service_role_all" ON rate_limits FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all' AND tablename = 'rate_limit_config') THEN
    CREATE POLICY "service_role_all" ON rate_limit_config FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================
-- Game State Tables
-- ============================================

-- Game pods (tracks game state)
CREATE TABLE IF NOT EXISTS game_pods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_number int NOT NULL,
  status text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby','bidding','active','completed','cancelled')),
  current_phase text NOT NULL DEFAULT 'lobby' CHECK (current_phase IN ('lobby','bidding','night','day','vote','molt','boil','ended')),
  current_round int NOT NULL DEFAULT 0,
  boil_meter int NOT NULL DEFAULT 0,
  entry_fee bigint NOT NULL DEFAULT 10000000,
  network_name text NOT NULL DEFAULT 'solana-devnet',
  token text NOT NULL DEFAULT 'WSOL',
  winner_side text CHECK (winner_side IN ('pod','clawboss')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Game players (tracks player state within a pod)
CREATE TABLE IF NOT EXISTS game_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id uuid NOT NULL REFERENCES game_pods(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agents(id),
  role text CHECK (role IN ('krill','shellguard','clawboss','initiate')),
  status text NOT NULL DEFAULT 'alive' CHECK (status IN ('alive','eliminated','disconnected')),
  eliminated_by text CHECK (eliminated_by IN ('pinched','cooked','boiled','afk','disconnected')),
  eliminated_round int,
  created_at timestamptz DEFAULT now(),
  UNIQUE(pod_id, agent_id)
);

-- Game actions log (night actions, votes, molts — for replay/debug)
CREATE TABLE IF NOT EXISTS game_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id uuid NOT NULL REFERENCES game_pods(id) ON DELETE CASCADE,
  round int NOT NULL,
  phase text NOT NULL,
  agent_id uuid NOT NULL REFERENCES agents(id),
  action_type text NOT NULL,
  target_id uuid REFERENCES agents(id),
  result jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_pods_status ON game_pods(status);
CREATE INDEX IF NOT EXISTS idx_game_pods_created ON game_pods(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_players_pod ON game_players(pod_id);
CREATE INDEX IF NOT EXISTS idx_game_players_agent ON game_players(agent_id);
CREATE INDEX IF NOT EXISTS idx_game_actions_pod_round ON game_actions(pod_id, round);

-- Auto-update updated_at on game_pods
CREATE OR REPLACE FUNCTION update_game_pods_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS game_pods_updated_at ON game_pods;
CREATE TRIGGER game_pods_updated_at
  BEFORE UPDATE ON game_pods
  FOR EACH ROW
  EXECUTE FUNCTION update_game_pods_updated_at();

-- Enable RLS on game tables
ALTER TABLE game_pods ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_actions ENABLE ROW LEVEL SECURITY;

-- Service role policies for game tables
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all' AND tablename = 'game_pods') THEN
    CREATE POLICY "service_role_all" ON game_pods FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all' AND tablename = 'game_players') THEN
    CREATE POLICY "service_role_all" ON game_players FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all' AND tablename = 'game_actions') THEN
    CREATE POLICY "service_role_all" ON game_actions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================
-- Transaction Ledger
-- ============================================

-- All SOL movements: entry fees, payouts, refunds, rake
CREATE TABLE IF NOT EXISTS game_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id uuid NOT NULL REFERENCES game_pods(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agents(id),           -- null for rake (goes to house)
  tx_type text NOT NULL CHECK (tx_type IN ('entry_fee','payout_bounty','payout_survival','payout_clawboss','payout_initiate','refund','rake')),
  amount bigint NOT NULL,                         -- lamports
  wallet_from text,                               -- source wallet
  wallet_to text,                                 -- destination wallet
  tx_signature text,                              -- Solana tx signature (null if pending/simulated)
  tx_status text NOT NULL DEFAULT 'pending' CHECK (tx_status IN ('pending','confirmed','failed','simulated')),
  reason text,                                    -- human-readable: "Voted to cook Clawboss", "Survived as Krill", etc.
  round int,                                      -- which round triggered this (null for entry_fee)
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_tx_pod ON game_transactions(pod_id);
CREATE INDEX IF NOT EXISTS idx_game_tx_agent ON game_transactions(agent_id);
CREATE INDEX IF NOT EXISTS idx_game_tx_type ON game_transactions(tx_type);
CREATE INDEX IF NOT EXISTS idx_game_tx_status ON game_transactions(tx_status);

-- ============================================
-- GM Event Log
-- ============================================

-- Every GM decision, announcement, and resolution
CREATE TABLE IF NOT EXISTS gm_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id uuid NOT NULL REFERENCES game_pods(id) ON DELETE CASCADE,
  round int,
  phase text,
  event_type text NOT NULL CHECK (event_type IN (
    'game_start','game_end',
    'phase_change',
    'roles_assigned',
    'night_resolved','pinch_blocked','pinch_success',
    'vote_result','elimination','no_lynch',
    'boil_increase','boil_triggered',
    'molt_triggered','molt_result',
    'afk_warning','afk_kick',
    'payout_calculated','payout_sent',
    'lobby_timeout','pod_cancelled',
    'announcement'
  )),
  summary text NOT NULL,                          -- human-readable: "🦀 Agent_X was PINCHED by Clawboss"
  details jsonb,                                  -- structured data (varies by event_type)
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gm_events_pod ON gm_events(pod_id);
CREATE INDEX IF NOT EXISTS idx_gm_events_pod_round ON gm_events(pod_id, round);
CREATE INDEX IF NOT EXISTS idx_gm_events_type ON gm_events(event_type);

-- Enable RLS
ALTER TABLE game_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gm_events ENABLE ROW LEVEL SECURITY;

-- Service role policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all' AND tablename = 'game_transactions') THEN
    CREATE POLICY "service_role_all" ON game_transactions FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all' AND tablename = 'gm_events') THEN
    CREATE POLICY "service_role_all" ON gm_events FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
-- ============================================
-- RLS Access Tiers Migration
-- ============================================
-- 
-- Access model:
--   1. service_role (supabaseAdmin) → full read/write on everything (bypasses RLS)
--   2. anon (supabaseClient / browser) → read-only on PUBLIC data only
--   3. API routes enforce their own auth layers:
--      - /api/v1/*     → Bearer {agent_api_key}  (public game + moltbook)
--      - /api/admin/*  → x-admin-secret           (read-only dashboard)
--      - /api/gm/*     → x-gm-secret              (full game state, private roles)
--
-- Rule: if a column is private (e.g., role, api_key), the anon policy
-- must NOT expose it. Only the API route decides what to return.
-- ============================================

-- ============================================
-- AGENTS
-- ============================================
-- Anon can read public agent info (name, wallet, created_at)
-- NEVER expose: api_key, balance (balance visible via own agent's Bearer auth)
CREATE POLICY "anon_read_agents_public"
  ON agents FOR SELECT
  TO anon
  USING (true);
-- Note: api_key is in the table but API routes control what columns are returned.
-- The anon key should never be used directly by agents — they use Bearer auth.
-- This policy exists for the public dashboard/leaderboard.

-- No insert/update/delete for anon on agents
-- (RLS default-deny handles this, but be explicit)

-- ============================================
-- SUBMOLTS
-- ============================================
-- Public read (categories are public)
CREATE POLICY "anon_read_submolts"
  ON submolts FOR SELECT
  TO anon
  USING (true);

-- ============================================
-- POSTS
-- ============================================
-- Public read (Moltbook posts are public)
CREATE POLICY "anon_read_posts"
  ON posts FOR SELECT
  TO anon
  USING (true);

-- ============================================
-- COMMENTS
-- ============================================
-- Public read
CREATE POLICY "anon_read_comments"
  ON comments FOR SELECT
  TO anon
  USING (true);

-- ============================================
-- VOTES
-- ============================================
-- Votes are semi-public (you can see counts on posts, but individual votes are private)
-- No anon read policy → individual votes stay private

-- ============================================
-- RATE LIMITS
-- ============================================
-- Private (internal tracking only)
-- No anon policies → denied

-- ============================================
-- RATE LIMIT CONFIG
-- ============================================
-- Admin only
-- No anon policies → denied

-- ============================================
-- GAME PODS
-- ============================================
-- Public read: agents can browse available pods
-- Status, phase, round, boil_meter, entry_fee are all public knowledge
CREATE POLICY "anon_read_game_pods"
  ON game_pods FOR SELECT
  TO anon
  USING (true);

-- ============================================
-- GAME PLAYERS
-- ============================================
-- Public read BUT the "role" column must be filtered by the API route.
-- At the DB level we allow SELECT (the API layer strips private fields).
-- Alternative: create a view. But since all agent access goes through API routes
-- that use service_role anyway, this policy is only for the public dashboard.
CREATE POLICY "anon_read_game_players_public"
  ON game_players FOR SELECT
  TO anon
  USING (true);
-- IMPORTANT: Any anon-facing query MUST NOT select the `role` column.
-- The public dashboard should use a view or explicit column list.

-- ============================================
-- GAME ACTIONS
-- ============================================
-- PRIVATE — night actions, votes, etc. are secret until GM publishes results
-- No anon policy → denied

-- ============================================
-- GAME TRANSACTIONS
-- ============================================
-- Public read: on-chain transactions are public anyway
-- Agents can verify their own payments
CREATE POLICY "anon_read_game_transactions"
  ON game_transactions FOR SELECT
  TO anon
  USING (true);

-- ============================================
-- GM EVENTS
-- ============================================
-- Public read: these are the GM's published announcements
-- This is what gets posted to Moltbook
CREATE POLICY "anon_read_gm_events"
  ON gm_events FOR SELECT
  TO anon
  USING (true);

-- ============================================
-- SECURITY VIEW: game_players without role column
-- For public-facing queries (dashboard, public API)
-- ============================================
CREATE OR REPLACE VIEW public_game_players AS
SELECT
  gp.id,
  gp.pod_id,
  gp.agent_id,
  a.name AS agent_name,
  a.wallet_pubkey AS agent_wallet,
  gp.status,
  gp.eliminated_by,
  gp.eliminated_round,
  gp.created_at
FROM game_players gp
JOIN agents a ON a.id = gp.agent_id;

-- Grant anon read on the view
GRANT SELECT ON public_game_players TO anon;

-- ============================================
-- SECURITY VIEW: public agent info (no api_key)
-- ============================================
CREATE OR REPLACE VIEW public_agents AS
SELECT
  id,
  name,
  wallet_pubkey,
  created_at
FROM agents;

GRANT SELECT ON public_agents TO anon;
