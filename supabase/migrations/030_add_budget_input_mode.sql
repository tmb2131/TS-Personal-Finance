-- Budget input is app-only.
-- Normalize any legacy sheet-sourced budget rows to manual and remove the old mode flag if present.

UPDATE budget_targets
SET data_source = 'manual'
WHERE data_source = 'google_sheet';

ALTER TABLE user_profiles
  DROP COLUMN IF EXISTS budget_input_mode;
