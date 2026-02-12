-- Move investment return rows to app-managed inputs.
-- After this, investment return data is entered and edited in-app.

UPDATE investment_return
SET data_source = 'manual'
WHERE data_source = 'google_sheet';

ALTER TABLE investment_return
  ALTER COLUMN data_source SET DEFAULT 'manual';
