-- Add data_source column to recurring_payments for manual entry support
ALTER TABLE recurring_payments
  ADD COLUMN IF NOT EXISTS data_source TEXT NOT NULL DEFAULT 'google_sheet'
  CHECK (data_source IN ('google_sheet', 'plaid', 'csv', 'manual'));
