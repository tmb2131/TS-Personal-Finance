-- Add data_source column to investment_return so manual app entries are preserved
-- when Google Sheet sync runs.
ALTER TABLE investment_return
  ADD COLUMN IF NOT EXISTS data_source TEXT NOT NULL DEFAULT 'manual'
  CHECK (data_source IN ('google_sheet', 'plaid', 'csv', 'manual'));

-- Promote legacy rows to app-owned/manual.
UPDATE investment_return
SET data_source = 'manual'
WHERE data_source IS NULL;

CREATE INDEX IF NOT EXISTS idx_investment_return_data_source
  ON investment_return(user_id, data_source);
