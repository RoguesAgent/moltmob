-- Add external_id to posts for tracking synced posts from real Moltbook
ALTER TABLE posts ADD COLUMN IF NOT EXISTS external_id text;

-- Index for looking up by external_id
CREATE INDEX IF NOT EXISTS idx_posts_external_id ON posts(external_id) WHERE external_id IS NOT NULL;
