-- Debt input is app-only.
-- Normalize all existing rows to manual and make manual the default source.

UPDATE debt
SET data_source = 'manual'
WHERE data_source <> 'manual';

ALTER TABLE debt
  ALTER COLUMN data_source SET DEFAULT 'manual';
