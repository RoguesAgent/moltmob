-- Add memo column to game_transactions for x402 payment verification
ALTER TABLE game_transactions ADD COLUMN IF NOT EXISTS memo text;
