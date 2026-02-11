-- Add pod_id column to posts table for linking mock Moltbook posts to game pods
ALTER TABLE posts ADD COLUMN IF NOT EXISTS pod_id uuid REFERENCES game_pods(id);

-- Create index for efficient lookup
CREATE INDEX IF NOT EXISTS idx_posts_pod_id ON posts(pod_id) WHERE pod_id IS NOT NULL;

-- Add moltbook_post_id column to game_pods for reverse lookup
ALTER TABLE game_pods ADD COLUMN IF NOT EXISTS moltbook_post_id text;
