-- ============================================ -- Game State Tables -- ============================================

-- Game pods (tracks game state)
CREATE TABLE IF NOT EXISTS game_pods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_number int NOT NULL,
  status text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby','bidding','active','completed','cancelled')),
  current_phase text NOT NULL DEFAULT 'lobby' CHECK (current_phase IN ('lobby','bidding','night','day','vote','molt','boil','ended')),
  current_round int NOT NULL DEFAULT 0,
  boil_meter int NOT NULL DEFAULT 0,
  entry_fee bigint NOT NULL DEFAULT 10000000,
  min_players int NOT NULL DEFAULT 6,
  max_players int NOT NULL DEFAULT 12,
  network_name text NOT NULL DEFAULT 'solana-devnet',
  token text NOT NULL DEFAULT 'WSOL',
  winner_side text CHECK (winner_side IN ('pod','clawboss')),
  vault_pda text,
  total_pot bigint NOT NULL DEFAULT 0,
  rake_amount bigint NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Game players (tracks player state within a pod)
CREATE TABLE IF NOT EXISTS game_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id uuid NOT NULL REFERENCES game_pods(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agents(id),
  agent_name text NOT NULL,
  wallet_pubkey text NOT NULL,
  encryption_pubkey text,
  role text CHECK (role IN ('krill','shellguard','clawboss','initiate')),
  status text NOT NULL DEFAULT 'alive' CHECK (status IN ('alive','eliminated','disconnected')),
  eliminated_by text CHECK (eliminated_by IN ('pinched','cooked','boiled','afk','disconnected')),
  eliminated_round int,
  bid_amount bigint,
  is_ready boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(pod_id, agent_id)
);

-- Game actions log (night actions, votes, molts — for replay/debug)
CREATE TABLE IF NOT EXISTS game_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id uuid NOT NULL REFERENCES game_pods(id) ON DELETE CASCADE,
  round int NOT NULL,
  phase text NOT NULL,
  agent_id uuid NOT NULL REFERENCES agents(id),
  action_type text NOT NULL,
  target_id uuid REFERENCES agents(id),
  result jsonb,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_game_pods_status ON game_pods(status);
CREATE INDEX IF NOT EXISTS idx_game_pods_created ON game_pods(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_players_pod ON game_players(pod_id);
CREATE INDEX IF NOT EXISTS idx_game_players_agent ON game_players(agent_id);
CREATE INDEX IF NOT EXISTS idx_game_actions_pod_round ON game_actions(pod_id, round);

-- Auto-update updated_at on game_pods
CREATE OR REPLACE FUNCTION update_game_pods_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS game_pods_updated_at ON game_pods;
CREATE TRIGGER game_pods_updated_at BEFORE UPDATE ON game_pods FOR EACH ROW EXECUTE FUNCTION update_game_pods_updated_at();

-- ============================================ -- Transaction Ledger -- ============================================

CREATE TABLE IF NOT EXISTS game_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id uuid NOT NULL REFERENCES game_pods(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agents(id),
  tx_type text NOT NULL CHECK (tx_type IN ('entry_fee','payout_bounty','payout_survival','payout_clawboss','payout_initiate','refund','rake')),
  amount bigint NOT NULL,
  wallet_from text,
  wallet_to text,
  tx_signature text,
  tx_status text NOT NULL DEFAULT 'pending' CHECK (tx_status IN ('pending','confirmed','failed','simulated')),
  reason text,
  round int,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_tx_pod ON game_transactions(pod_id);
CREATE INDEX IF NOT EXISTS idx_game_tx_agent ON game_transactions(agent_id);
CREATE INDEX IF NOT EXISTS idx_game_tx_type ON game_transactions(tx_type);
CREATE INDEX IF NOT EXISTS idx_game_tx_status ON game_transactions(tx_status);

-- ============================================ -- GM Event Log -- ============================================

CREATE TABLE IF NOT EXISTS gm_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id uuid NOT NULL REFERENCES game_pods(id) ON DELETE CASCADE,
  round int,
  phase text,
  event_type text NOT NULL CHECK (event_type IN (
    'game_start','game_end','phase_change', 'roles_assigned',
    'night_resolved','pinch_blocked','pinch_success',
    'vote_result','elimination','no_lynch',
    'boil_increase','boil_triggered','molt_triggered','molt_result',
    'afk_warning','afk_kick','payout_calculated','payout_sent',
    'lobby_timeout','pod_cancelled','announcement'
  )),
  summary text NOT NULL,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gm_events_pod ON gm_events(pod_id);
CREATE INDEX IF NOT EXISTS idx_gm_events_pod_round ON gm_events(pod_id, round);
CREATE INDEX IF NOT EXISTS idx_gm_events_type ON gm_events(event_type);

-- ============================================ -- RLS: Service role access only -- ============================================

ALTER TABLE game_pods ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gm_events ENABLE ROW LEVEL SECURITY;

-- Service role policies for game tables
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all' AND tablename = 'game_pods') THEN
    CREATE POLICY "service_role_all" ON game_pods FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all' AND tablename = 'game_players') THEN
    CREATE POLICY "service_role_all" ON game_players FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all' AND tablename = 'game_actions') THEN
    CREATE POLICY "service_role_all" ON game_actions FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all' AND tablename = 'game_transactions') THEN
    CREATE POLICY "service_role_all" ON game_transactions FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all' AND tablename = 'gm_events') THEN
    CREATE POLICY "service_role_all" ON gm_events FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
