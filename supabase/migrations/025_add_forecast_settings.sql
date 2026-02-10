-- Forecast settings per user and category
-- Stores preferred forecasting methodologies for current year and current month

CREATE TABLE IF NOT EXISTS forecast_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    current_year_method TEXT NOT NULL CHECK (current_year_method IN ('Annual', 'Linear', 'Budget')),
    current_month_method TEXT NOT NULL CHECK (current_month_method IN ('Linear', 'Average')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT forecast_settings_user_category_key UNIQUE (user_id, category)
);

CREATE INDEX IF NOT EXISTS idx_forecast_settings_user ON forecast_settings(user_id);

ALTER TABLE forecast_settings ENABLE ROW LEVEL SECURITY;

-- Policies: users can CRUD only their rows
CREATE POLICY "user_own_data" ON forecast_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

