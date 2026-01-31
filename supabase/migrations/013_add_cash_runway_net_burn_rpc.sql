-- RPC to compute net burn (expenses + refunds) per currency for Cash Runway.
-- Matches app logic: category NOT IN ('Income', 'Excluded', 'Gift Money');
-- USD = currency IS NULL OR currency = 'USD'; GBP = currency = 'GBP'.
-- No row limit: aggregation happens in DB.
CREATE OR REPLACE FUNCTION get_cash_runway_net_burn(p_start date, p_end date)
RETURNS TABLE (gbp_net numeric, usd_net numeric)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(SUM(CASE WHEN UPPER(TRIM(COALESCE(currency, ''))) = 'GBP' THEN amount_gbp END), 0),
    COALESCE(SUM(CASE WHEN currency IS NULL OR UPPER(TRIM(currency)) = 'USD' THEN amount_usd END), 0)
  FROM transaction_log
  WHERE date >= p_start AND date <= p_end
    AND category NOT IN ('Income', 'Excluded', 'Gift Money');
$$;
