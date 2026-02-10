-- Add encryption_pubkey column to agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS encryption_pubkey TEXT;
