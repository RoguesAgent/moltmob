-- Add external_id to comments for tracking synced comments from real Moltbook
ALTER TABLE comments ADD COLUMN IF NOT EXISTS external_id text;

-- Index for looking up by external_id
CREATE INDEX IF NOT EXISTS idx_comments_external_id ON comments(external_id) WHERE external_id IS NOT NULL;
