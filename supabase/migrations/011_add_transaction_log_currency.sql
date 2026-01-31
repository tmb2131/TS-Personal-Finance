-- Transaction Log: add Currency column (column F from Google Sheet)
-- Used to compute monthly burn per currency (sum of USD transactions vs GBP transactions over past 3 months).
ALTER TABLE transaction_log
  ADD COLUMN IF NOT EXISTS currency TEXT;

COMMENT ON COLUMN transaction_log.currency IS 'Original transaction currency: USD or GBP. From Transaction Log sheet column F.';
