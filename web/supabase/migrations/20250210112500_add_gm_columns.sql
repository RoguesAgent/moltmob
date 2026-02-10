-- Add GM columns to game_pods
ALTER TABLE game_pods ADD COLUMN IF NOT EXISTS gm_wallet text;
ALTER TABLE game_pods ADD COLUMN IF NOT EXISTS gm_agent_id uuid REFERENCES agents(id);
ALTER TABLE game_pods ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE game_pods ADD COLUMN IF NOT EXISTS completed_at timestamptz;
