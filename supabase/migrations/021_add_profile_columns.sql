-- Add profile columns to account_balances (columns I, J, K in sheet)
-- These classify accounts by liquidity, risk, and time horizon

ALTER TABLE account_balances
  ADD COLUMN IF NOT EXISTS liquidity_profile TEXT,
  ADD COLUMN IF NOT EXISTS risk_profile TEXT,
  ADD COLUMN IF NOT EXISTS horizon_profile TEXT;

-- Add indexes for filtering by profiles
CREATE INDEX IF NOT EXISTS idx_account_balances_liquidity_profile
  ON account_balances(user_id, liquidity_profile);

CREATE INDEX IF NOT EXISTS idx_account_balances_risk_profile
  ON account_balances(user_id, risk_profile);

CREATE INDEX IF NOT EXISTS idx_account_balances_horizon_profile
  ON account_balances(user_id, horizon_profile);

-- Add comments for documentation
COMMENT ON COLUMN account_balances.liquidity_profile IS 'Liquidity classification (e.g., High, Medium, Low, Locked)';
COMMENT ON COLUMN account_balances.risk_profile IS 'Risk classification (e.g., Conservative, Moderate, Aggressive)';
COMMENT ON COLUMN account_balances.horizon_profile IS 'Time horizon classification (e.g., Short-term, Medium-term, Long-term)';
