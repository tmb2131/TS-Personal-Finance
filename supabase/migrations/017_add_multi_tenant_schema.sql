-- Multi-tenant schema: user_profiles + user_id on all user-specific tables.
-- FX tables (fx_rates, fx_rate_current) stay global. All other data is per-user.
-- Backfill uses the first auth.users row as "legacy" user so existing data gets that user_id.

-- 1. User → sheet mapping (and optional display name)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  google_spreadsheet_id TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_profile" ON user_profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 2. Add user_id (nullable first) to all user-specific tables
ALTER TABLE account_balances ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE transaction_log ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE budget_targets ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE historical_net_worth ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE annual_trends ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE monthly_trends ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE yoy_net_worth ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE recurring_preferences ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE recurring_payments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE kids_accounts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE investment_return ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE budget_history ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE sync_metadata ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. Backfill: set user_id to first auth user (for existing single-tenant data)
-- If no auth users exist (e.g. fresh DB), remove sync_metadata row so NOT NULL can be applied.
DO $$
DECLARE
  legacy_user_id UUID;
BEGIN
  SELECT id INTO legacy_user_id FROM auth.users LIMIT 1;
  IF legacy_user_id IS NOT NULL THEN
    UPDATE account_balances SET user_id = legacy_user_id WHERE user_id IS NULL;
    UPDATE transaction_log SET user_id = legacy_user_id WHERE user_id IS NULL;
    UPDATE budget_targets SET user_id = legacy_user_id WHERE user_id IS NULL;
    UPDATE historical_net_worth SET user_id = legacy_user_id WHERE user_id IS NULL;
    UPDATE annual_trends SET user_id = legacy_user_id WHERE user_id IS NULL;
    UPDATE monthly_trends SET user_id = legacy_user_id WHERE user_id IS NULL;
    UPDATE yoy_net_worth SET user_id = legacy_user_id WHERE user_id IS NULL;
    UPDATE recurring_preferences SET user_id = legacy_user_id WHERE user_id IS NULL;
    UPDATE recurring_payments SET user_id = legacy_user_id WHERE user_id IS NULL;
    UPDATE kids_accounts SET user_id = legacy_user_id WHERE user_id IS NULL;
    UPDATE investment_return SET user_id = legacy_user_id WHERE user_id IS NULL;
    UPDATE budget_history SET user_id = legacy_user_id WHERE user_id IS NULL;
    UPDATE sync_metadata SET user_id = legacy_user_id WHERE user_id IS NULL;
  ELSE
    DELETE FROM sync_metadata;
  END IF;
END $$;

-- 4. Set user_id NOT NULL
ALTER TABLE account_balances ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE transaction_log ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE budget_targets ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE historical_net_worth ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE annual_trends ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE monthly_trends ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE yoy_net_worth ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE recurring_preferences ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE recurring_payments ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE kids_accounts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE investment_return ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE budget_history ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE sync_metadata ALTER COLUMN user_id SET NOT NULL;

-- 5. sync_metadata: allow multiple rows (one per user); keep id as PK, add unique(user_id)
ALTER TABLE sync_metadata DROP CONSTRAINT IF EXISTS sync_metadata_id_check;
CREATE SEQUENCE IF NOT EXISTS sync_metadata_id_seq;
ALTER TABLE sync_metadata ALTER COLUMN id DROP DEFAULT;
ALTER TABLE sync_metadata ALTER COLUMN id SET DEFAULT nextval('sync_metadata_id_seq');
ALTER TABLE sync_metadata ADD CONSTRAINT sync_metadata_user_id_key UNIQUE (user_id);

-- 6. Drop old unique constraints and add (user_id, ...) composite uniques
-- Use DO block to drop by matching unique constraint (handles truncated names)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT c.conname, c.conrelid::regclass AS tbl
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND c.contype = 'u'
      AND c.conrelid IN (
        'account_balances'::regclass, 'budget_targets'::regclass, 'historical_net_worth'::regclass,
        'annual_trends'::regclass, 'monthly_trends'::regclass, 'yoy_net_worth'::regclass,
        'recurring_payments'::regclass, 'recurring_preferences'::regclass, 'kids_accounts'::regclass,
        'investment_return'::regclass, 'budget_history'::regclass
      )
  ) LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.tbl, r.conname);
  END LOOP;
END $$;

ALTER TABLE account_balances ADD CONSTRAINT account_balances_user_institution_account_date_key
  UNIQUE (user_id, institution, account_name, date_updated);
ALTER TABLE budget_targets ADD CONSTRAINT budget_targets_user_category_key UNIQUE (user_id, category);
ALTER TABLE historical_net_worth ADD CONSTRAINT historical_net_worth_user_date_category_key
  UNIQUE (user_id, date, category);
ALTER TABLE annual_trends ADD CONSTRAINT annual_trends_user_category_key UNIQUE (user_id, category);
ALTER TABLE monthly_trends ADD CONSTRAINT monthly_trends_user_category_key UNIQUE (user_id, category);
ALTER TABLE yoy_net_worth ADD CONSTRAINT yoy_net_worth_user_category_key UNIQUE (user_id, category);
ALTER TABLE recurring_payments ADD CONSTRAINT recurring_payments_user_name_key UNIQUE (user_id, name);
ALTER TABLE recurring_preferences ADD CONSTRAINT recurring_preferences_user_counterparty_key
  UNIQUE (user_id, counterparty_pattern);
ALTER TABLE kids_accounts ADD CONSTRAINT kids_accounts_user_child_type_date_notes_key
  UNIQUE (user_id, child_name, account_type, date_updated, notes);
ALTER TABLE investment_return ADD CONSTRAINT investment_return_user_income_source_key
  UNIQUE (user_id, income_source);
ALTER TABLE budget_history ADD CONSTRAINT budget_history_user_date_category_key
  UNIQUE (user_id, date, category);

-- 7. Indexes for common filters (user_id + date/category)
CREATE INDEX IF NOT EXISTS idx_account_balances_user_date ON account_balances(user_id, date_updated DESC);
CREATE INDEX IF NOT EXISTS idx_transaction_log_user_date ON transaction_log(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_budget_history_user_date ON budget_history(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_historical_net_worth_user_date ON historical_net_worth(user_id, date DESC);
