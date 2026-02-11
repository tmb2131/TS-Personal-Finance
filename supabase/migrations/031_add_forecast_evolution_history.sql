-- Forecast evolution history:
-- Capture daily effective settings and budgets so historical forecasts can be
-- recomputed by date rollback instead of reading budget_history snapshots.

CREATE TABLE IF NOT EXISTS forecast_settings_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  effective_date DATE NOT NULL,
  current_year_method TEXT NOT NULL CHECK (current_year_method IN ('Annual', 'Linear', 'Budget', 'Manual')),
  current_month_method TEXT NOT NULL CHECK (current_month_method IN ('Linear', 'Average', 'Manual')),
  manual_year_forecast NUMERIC(15, 2),
  manual_month_forecast NUMERIC(15, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT forecast_settings_history_user_category_effective_date_key
    UNIQUE (user_id, category, effective_date)
);

CREATE TABLE IF NOT EXISTS budget_targets_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  effective_date DATE NOT NULL,
  annual_budget_gbp NUMERIC(15, 2) NOT NULL DEFAULT 0,
  annual_budget_usd NUMERIC(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT budget_targets_history_user_category_effective_date_key
    UNIQUE (user_id, category, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_forecast_settings_history_user_date
  ON forecast_settings_history (user_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_forecast_settings_history_user_category_date
  ON forecast_settings_history (user_id, category, effective_date DESC);

CREATE INDEX IF NOT EXISTS idx_budget_targets_history_user_date
  ON budget_targets_history (user_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_budget_targets_history_user_category_date
  ON budget_targets_history (user_id, category, effective_date DESC);

ALTER TABLE forecast_settings_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_targets_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_own_data" ON forecast_settings_history;
CREATE POLICY "user_own_data" ON forecast_settings_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_own_data" ON budget_targets_history;
CREATE POLICY "user_own_data" ON budget_targets_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.log_forecast_settings_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  effective_date_utc DATE := (timezone('utc', now()))::date;
BEGIN
  IF NEW.user_id IS NULL OR NEW.category IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
    AND NEW.category IS NOT DISTINCT FROM OLD.category
    AND NEW.current_year_method IS NOT DISTINCT FROM OLD.current_year_method
    AND NEW.current_month_method IS NOT DISTINCT FROM OLD.current_month_method
    AND NEW.manual_year_forecast IS NOT DISTINCT FROM OLD.manual_year_forecast
    AND NEW.manual_month_forecast IS NOT DISTINCT FROM OLD.manual_month_forecast THEN
    RETURN NEW;
  END IF;

  INSERT INTO forecast_settings_history (
    user_id,
    category,
    effective_date,
    current_year_method,
    current_month_method,
    manual_year_forecast,
    manual_month_forecast
  )
  VALUES (
    NEW.user_id,
    NEW.category,
    effective_date_utc,
    NEW.current_year_method,
    NEW.current_month_method,
    NEW.manual_year_forecast,
    NEW.manual_month_forecast
  )
  ON CONFLICT (user_id, category, effective_date)
  DO UPDATE SET
    current_year_method = EXCLUDED.current_year_method,
    current_month_method = EXCLUDED.current_month_method,
    manual_year_forecast = EXCLUDED.manual_year_forecast,
    manual_month_forecast = EXCLUDED.manual_month_forecast,
    created_at = NOW();

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_budget_targets_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  effective_date_utc DATE := (timezone('utc', now()))::date;
BEGIN
  IF NEW.user_id IS NULL OR NEW.category IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
    AND NEW.category IS NOT DISTINCT FROM OLD.category
    AND NEW.annual_budget_gbp IS NOT DISTINCT FROM OLD.annual_budget_gbp
    AND NEW.annual_budget_usd IS NOT DISTINCT FROM OLD.annual_budget_usd THEN
    RETURN NEW;
  END IF;

  INSERT INTO budget_targets_history (
    user_id,
    category,
    effective_date,
    annual_budget_gbp,
    annual_budget_usd
  )
  VALUES (
    NEW.user_id,
    NEW.category,
    effective_date_utc,
    COALESCE(NEW.annual_budget_gbp, 0),
    COALESCE(NEW.annual_budget_usd, 0)
  )
  ON CONFLICT (user_id, category, effective_date)
  DO UPDATE SET
    annual_budget_gbp = EXCLUDED.annual_budget_gbp,
    annual_budget_usd = EXCLUDED.annual_budget_usd,
    created_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_forecast_settings_history ON forecast_settings;
CREATE TRIGGER trg_forecast_settings_history
AFTER INSERT OR UPDATE ON forecast_settings
FOR EACH ROW
EXECUTE FUNCTION public.log_forecast_settings_history();

DROP TRIGGER IF EXISTS trg_budget_targets_history ON budget_targets;
CREATE TRIGGER trg_budget_targets_history
AFTER INSERT OR UPDATE ON budget_targets
FOR EACH ROW
EXECUTE FUNCTION public.log_budget_targets_history();

-- Baseline rows for existing users/categories so historical computations can
-- use a starting point even before the next explicit settings/budget edit.
INSERT INTO forecast_settings_history (
  user_id,
  category,
  effective_date,
  current_year_method,
  current_month_method,
  manual_year_forecast,
  manual_month_forecast
)
SELECT
  user_id,
  category,
  (timezone('utc', now()))::date AS effective_date,
  current_year_method,
  current_month_method,
  manual_year_forecast,
  manual_month_forecast
FROM forecast_settings
ON CONFLICT (user_id, category, effective_date) DO NOTHING;

INSERT INTO budget_targets_history (
  user_id,
  category,
  effective_date,
  annual_budget_gbp,
  annual_budget_usd
)
SELECT
  user_id,
  category,
  (timezone('utc', now()))::date AS effective_date,
  COALESCE(annual_budget_gbp, 0),
  COALESCE(annual_budget_usd, 0)
FROM budget_targets
ON CONFLICT (user_id, category, effective_date) DO NOTHING;
