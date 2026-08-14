-- Exclude non-cash mark-to-market ledger rows from the Cash Runway net burn.
--
-- "Valuation change" rows revalue an illiquid holding and book as a sterling
-- inflow. They currently carry category = 'Excluded', so the existing category
-- filter already keeps them out — but that is a property of how the source
-- sheet happens to be categorised, not a guarantee. Recategorising a single row
-- upstream would silently inflate runway. The guard is enforced here on the
-- counterparty too, matching lib/category-filters.ts.
--
-- Matched on the exact normalized name, never as a substring: real expenses
-- such as "Prestige Valuations" must keep flowing through.
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
    AND category NOT IN ('Income', 'Excluded', 'Gift Money')
    AND LOWER(TRIM(COALESCE(counterparty, ''))) <> 'valuation change';
$$;
