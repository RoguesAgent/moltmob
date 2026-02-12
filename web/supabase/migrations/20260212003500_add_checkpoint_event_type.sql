-- Add orchestrator_checkpoint to allowed event types for crash recovery
ALTER TABLE gm_events DROP CONSTRAINT IF EXISTS gm_events_event_type_check;

ALTER TABLE gm_events ADD CONSTRAINT gm_events_event_type_check CHECK (event_type IN (
  'game_start','game_end',
  'phase_change',
  'roles_assigned',
  'night_resolved','pinch_blocked','pinch_success',
  'vote_result','elimination','no_cook',
  'boil_increase','boil_triggered',
  'molt_triggered','molt_result',
  'afk_warning','afk_kick',
  'payout_calculated','payout_sent',
  'lobby_timeout','pod_cancelled',
  'announcement',
  'orchestrator_checkpoint',
  'message_decrypted'
));
