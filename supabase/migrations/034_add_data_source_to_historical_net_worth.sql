-- Track whether historical_net_worth rows are generated from account history
-- or manually curated by the user.
ALTER TABLE historical_net_worth
  ADD COLUMN IF NOT EXISTS data_source TEXT NOT NULL DEFAULT 'app_generated'
  CHECK (data_source IN ('app_generated', 'manual'));

UPDATE historical_net_worth
SET data_source = 'app_generated'
WHERE data_source IS NULL;

CREATE INDEX IF NOT EXISTS idx_historical_net_worth_data_source
  ON historical_net_worth(user_id, data_source, date DESC);
