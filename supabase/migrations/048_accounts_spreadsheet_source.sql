-- Second Google Sheet source, for account balances.
--
-- Migration 036 moved account balances out of the main sheet sync and made them
-- app-managed. That left no way to pull the balances that are still maintained
-- in the master workbook, so they went stale. This adds a separate spreadsheet
-- id used only by the accounts importer, keeping it independent of
-- google_spreadsheet_id, which points at the derived Data Tables workbook that
-- feeds transactions and FX.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS google_accounts_spreadsheet_id TEXT;

COMMENT ON COLUMN user_profiles.google_accounts_spreadsheet_id IS
  'Spreadsheet id for the accounts importer (master workbook, Accounts tab). Distinct from google_spreadsheet_id, which is the derived Data Tables workbook.';
