-- Add Tracking (Est) and YTD columns to budget_targets table
ALTER TABLE budget_targets
ADD COLUMN IF NOT EXISTS tracking_est_gbp NUMERIC(15, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS ytd_gbp NUMERIC(15, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS tracking_est_usd NUMERIC(15, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS ytd_usd NUMERIC(15, 2) DEFAULT 0;
