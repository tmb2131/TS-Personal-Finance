-- Per-user default currency for app display (USD or GBP). New users default to USD.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS default_currency TEXT NOT NULL DEFAULT 'USD'
  CHECK (default_currency IN ('USD', 'GBP'));
