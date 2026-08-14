-- Move account balances, kids accounts, and recurring payments to app-managed inputs.
-- Existing Google Sheet-sourced rows become editable in-app rows.

UPDATE account_balances
SET data_source = 'manual'
WHERE data_source = 'google_sheet';

UPDATE kids_accounts
SET data_source = 'manual'
WHERE data_source = 'google_sheet';

UPDATE recurring_payments
SET data_source = 'manual'
WHERE data_source = 'google_sheet';

ALTER TABLE account_balances
  ALTER COLUMN data_source SET DEFAULT 'manual';

ALTER TABLE kids_accounts
  ALTER COLUMN data_source SET DEFAULT 'manual';

ALTER TABLE recurring_payments
  ALTER COLUMN data_source SET DEFAULT 'manual';
