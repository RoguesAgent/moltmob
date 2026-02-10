-- Add message_decrypted event type for GM decryption logging
ALTER TABLE gm_events DROP CONSTRAINT IF EXISTS gm_events_event_type_check;

ALTER TABLE gm_events ADD CONSTRAINT gm_events_event_type_check CHECK (event_type IN (
  'game_start','game_end',
  'phase_change',
  'roles_assigned',
  'night_resolved','pinch_blocked','pinch_success',
  'vote_result','elimination','no_cook',
  'pod_cancelled',
  'message_decrypted'
));
