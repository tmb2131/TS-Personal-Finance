-- Add optional notes to recurring payments (manual/csv entries)
ALTER TABLE recurring_payments
  ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN recurring_payments.notes IS 'User notes for this recurring payment (e.g. renewal date, account ref).';
