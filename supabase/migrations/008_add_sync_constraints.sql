-- Add constraints to support efficient upsert in sync (Phase 2)
-- Run this migration before refactoring sync logic.

-- ---------------------------------------------------------------------------
-- 1. transaction_log: composite unique for upsert (date + category + counterparty + amounts)
--    PostgreSQL treats NULL != NULL in UNIQUE, so we add a dedup column for stable keys.
-- ---------------------------------------------------------------------------
ALTER TABLE transaction_log
  ADD COLUMN IF NOT EXISTS counterparty_dedup TEXT NOT NULL DEFAULT '';

-- Backfill existing rows so constraint can be added
UPDATE transaction_log
SET counterparty_dedup = COALESCE(counterparty, '');

-- Drop if exists to allow re-running migration
ALTER TABLE transaction_log DROP CONSTRAINT IF EXISTS transaction_log_dedup_key;

ALTER TABLE transaction_log
  ADD CONSTRAINT transaction_log_dedup_key
  UNIQUE (date, category, counterparty_dedup, amount_usd, amount_gbp);

-- ---------------------------------------------------------------------------
-- 2. recurring_payments: unique on name for upsert
--    Deduplicate by name first (keep one row per name, the one with smallest id).
-- ---------------------------------------------------------------------------
ALTER TABLE recurring_payments DROP CONSTRAINT IF EXISTS recurring_payments_name_key;

-- Remove duplicate names: keep one row per name (the one with the smallest id)
DELETE FROM recurring_payments a
USING recurring_payments b
WHERE a.name = b.name AND a.id > b.id;

ALTER TABLE recurring_payments
  ADD CONSTRAINT recurring_payments_name_key UNIQUE (name);
