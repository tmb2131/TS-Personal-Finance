-- Add data_source column to tables that will support multiple input methods
ALTER TABLE account_balances
  ADD COLUMN data_source TEXT NOT NULL DEFAULT 'google_sheet'
  CHECK (data_source IN ('google_sheet', 'plaid', 'csv', 'manual'));

ALTER TABLE transaction_log
  ADD COLUMN data_source TEXT NOT NULL DEFAULT 'google_sheet'
  CHECK (data_source IN ('google_sheet', 'plaid', 'csv', 'manual'));

ALTER TABLE budget_targets
  ADD COLUMN data_source TEXT NOT NULL DEFAULT 'google_sheet'
  CHECK (data_source IN ('google_sheet', 'plaid', 'csv', 'manual'));

ALTER TABLE debt
  ADD COLUMN data_source TEXT NOT NULL DEFAULT 'google_sheet'
  CHECK (data_source IN ('google_sheet', 'plaid', 'csv', 'manual'));

ALTER TABLE kids_accounts
  ADD COLUMN data_source TEXT NOT NULL DEFAULT 'google_sheet'
  CHECK (data_source IN ('google_sheet', 'plaid', 'csv', 'manual'));

-- Add index for filtering by source
CREATE INDEX idx_transaction_log_data_source ON transaction_log(user_id, data_source);
CREATE INDEX idx_account_balances_data_source ON account_balances(user_id, data_source);
