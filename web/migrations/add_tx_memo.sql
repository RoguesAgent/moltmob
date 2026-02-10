-- Add memo column to game_transactions for x402 memo verification
ALTER TABLE game_transactions ADD COLUMN IF NOT EXISTS memo TEXT;

COMMENT ON COLUMN game_transactions.memo IS 'Solana memo from x402 payment (e.g. moltmob:join:<pod_id>:<agent_id>)';
