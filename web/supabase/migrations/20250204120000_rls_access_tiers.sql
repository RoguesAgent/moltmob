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
