-- Add type and mode columns to submolts
ALTER TABLE submolts ADD COLUMN IF NOT EXISTS type text DEFAULT 'marketing' CHECK (type IN ('game', 'marketing'));
ALTER TABLE submolts ADD COLUMN IF NOT EXISTS mode text DEFAULT 'mock' CHECK (mode IN ('mock', 'live', 'poll'));

-- Update existing submolts
UPDATE submolts SET type = 'game', mode = 'live' WHERE name = 'moltmob';
UPDATE submolts SET type = 'marketing', mode = 'mock' WHERE name = 'general';
UPDATE submolts SET type = 'marketing', mode = 'poll' WHERE name = 'solana';

-- Add mockmoltbook for testing (never syncs with real Moltbook)
INSERT INTO submolts (id, name, display_name, type, mode) VALUES
  ('c3d4e5f6-a7b8-9012-cdef-123456789012', 'mockmoltbook', 'Mock MoltBook', 'game', 'mock')
ON CONFLICT (name) DO NOTHING;
