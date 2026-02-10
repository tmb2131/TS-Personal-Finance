-- Extend forecast_settings method constraints to include Manual
ALTER TABLE forecast_settings
  DROP CONSTRAINT IF EXISTS forecast_settings_current_year_method_check,
  DROP CONSTRAINT IF EXISTS forecast_settings_current_month_method_check;

ALTER TABLE forecast_settings
  ADD CONSTRAINT forecast_settings_current_year_method_check
    CHECK (current_year_method IN ('Annual', 'Linear', 'Budget', 'Manual')),
  ADD CONSTRAINT forecast_settings_current_month_method_check
    CHECK (current_month_method IN ('Linear', 'Average', 'Manual'));

