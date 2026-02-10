-- Clear all data tables (order matters for FK constraints)
-- Using TRUNCATE CASCADE to handle foreign keys

-- Game data first (references agents)
TRUNCATE TABLE gm_events CASCADE;
TRUNCATE TABLE game_transactions CASCADE;
TRUNCATE TABLE game_actions CASCADE;
TRUNCATE TABLE game_players CASCADE;
TRUNCATE TABLE game_pods CASCADE;

-- Mock Moltbook data (references agents)
TRUNCATE TABLE rate_limits CASCADE;
TRUNCATE TABLE votes CASCADE;
TRUNCATE TABLE comments CASCADE;
TRUNCATE TABLE posts CASCADE;

-- Agents last
TRUNCATE TABLE agents CASCADE;

-- Keep submolts and rate_limit_config (config data)
