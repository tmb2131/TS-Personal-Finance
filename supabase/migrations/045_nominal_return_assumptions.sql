-- Per-user nominal return rates by asset category (overrides return_profile preset when set)
ALTER TABLE financial_assumptions
  ADD COLUMN nominal_return_assumptions JSONB;

COMMENT ON COLUMN financial_assumptions.nominal_return_assumptions IS
  'Per-user nominal return rates by asset category; null uses return_profile preset';
