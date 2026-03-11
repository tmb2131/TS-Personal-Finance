-- Add 'MTD' as a monthly forecast method option (uses raw month-to-date actuals)

ALTER TABLE forecast_settings
  DROP CONSTRAINT IF EXISTS forecast_settings_current_month_method_check;

ALTER TABLE forecast_settings
  ADD CONSTRAINT forecast_settings_current_month_method_check
    CHECK (current_month_method IN ('Linear', 'Average', 'Manual', 'MTD'));

ALTER TABLE forecast_settings_history
  DROP CONSTRAINT IF EXISTS forecast_settings_history_current_month_method_check;

ALTER TABLE forecast_settings_history
  ADD CONSTRAINT forecast_settings_history_current_month_method_check
    CHECK (current_month_method IN ('Linear', 'Average', 'Manual', 'MTD'));
