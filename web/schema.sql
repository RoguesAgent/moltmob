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
