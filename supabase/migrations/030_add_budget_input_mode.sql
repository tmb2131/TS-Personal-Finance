-- Per-user source of truth for category budgets.
-- app   = budgets/methods are edited in Findash and sync ignores the Budget Targets tab.
-- sheet = budgets are refreshed from Google Sheet on sync.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS budget_input_mode TEXT NOT NULL DEFAULT 'app'
  CHECK (budget_input_mode IN ('app', 'sheet'));
