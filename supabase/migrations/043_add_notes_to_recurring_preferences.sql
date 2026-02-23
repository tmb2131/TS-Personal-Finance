-- Notes for detected recurring payments (Monthly Subscriptions / Annual Commitments)
ALTER TABLE recurring_preferences
  ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN recurring_preferences.notes IS 'User notes for this detected recurring payment (e.g. renewal date, account ref).';
