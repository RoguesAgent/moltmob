-- Add phase management columns to game_pods
ALTER TABLE game_pods ADD COLUMN IF NOT EXISTS phase_started_at timestamptz;
ALTER TABLE game_pods ADD COLUMN IF NOT EXISTS phase_deadline timestamptz;
ALTER TABLE game_pods ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz;

-- Add has_acted_this_phase to game_players
ALTER TABLE game_players ADD COLUMN IF NOT EXISTS has_acted_this_phase boolean DEFAULT false;

-- Index for finding active games efficiently
CREATE INDEX IF NOT EXISTS idx_game_pods_active ON game_pods(status, moltbook_mode) WHERE status IN ('lobby', 'active');
