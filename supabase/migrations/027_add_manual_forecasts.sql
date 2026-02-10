-- Add manual forecast override values to forecast_settings
ALTER TABLE forecast_settings
ADD COLUMN IF NOT EXISTS manual_year_forecast NUMERIC(15, 2),
ADD COLUMN IF NOT EXISTS manual_month_forecast NUMERIC(15, 2);

