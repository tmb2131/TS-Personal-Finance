-- Index on transaction_log.currency for queries that filter/group by currency
-- (e.g. get_cash_runway_net_burn, spending by currency). Improves plan cost for
-- currency-based aggregations as the table grows.
CREATE INDEX IF NOT EXISTS idx_transaction_log_currency ON transaction_log USING btree (currency);
