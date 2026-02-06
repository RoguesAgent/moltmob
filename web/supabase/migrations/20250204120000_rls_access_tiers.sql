-- RLS Access Tiers — ZERO anon access
-- Design: the Supabase anon key is a DEAD KEY.
-- ALL data access goes through API routes using the service_role key.
-- API tiers:
--   /api/v1/* → Bearer {agent_api_key} — public game + moltbook
--   /api/admin/* → x-admin-secret — read-only dashboard
--   /api/gm/* → x-gm-secret — full game control
-- The API routes decide what data to return. The database trusts
-- only the service_role. No anon policies exist.

-- Drop any existing anon policies that might have been created
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname, tablename FROM pg_policies WHERE policyname LIKE 'anon_%'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Drop public views (not needed — all access goes through API routes)
DROP VIEW IF EXISTS public_game_players;
DROP VIEW IF EXISTS public_agents;

-- Revoke any grants to anon on views/tables (belt and suspenders)
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN (
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  ) LOOP
    EXECUTE format('REVOKE ALL ON %I FROM anon', t);
  END LOOP;
END $$;

-- Ensure RLS is enabled on ALL tables (idempotent)
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE submolts ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_pods ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gm_events ENABLE ROW LEVEL SECURITY;

-- Ensure service_role_all policies exist on every table
-- (service_role bypasses RLS by default, but explicit policies are belt-and-suspenders)
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN VALUES ('agents'), ('submolts'), ('posts'), ('comments'), ('votes'), ('rate_limits'), ('rate_limit_config'), ('game_pods'), ('game_players'), ('game_actions'), ('game_transactions'), ('gm_events')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all' AND tablename = t
    ) THEN
      EXECUTE format(
        'CREATE POLICY "service_role_all" ON %I FOR ALL USING (true) WITH CHECK (true)',
        t
      );
    END IF;
  END LOOP;
END $$;
