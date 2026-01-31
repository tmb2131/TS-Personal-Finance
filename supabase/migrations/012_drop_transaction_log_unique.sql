-- Drop unique constraint on transaction_log so replace-all sync can insert all source rows
-- (sheet may contain duplicate rows with same date/category/counterparty/amounts).
ALTER TABLE transaction_log DROP CONSTRAINT IF EXISTS transaction_log_dedup_key;
