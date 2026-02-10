-- Add moltbook_mode column to track mock vs live games
ALTER TABLE game_pods ADD COLUMN IF NOT EXISTS moltbook_mode text DEFAULT 'mock';

-- Update existing rows to have mock mode
UPDATE game_pods SET moltbook_mode = 'mock' WHERE moltbook_mode IS NULL;
