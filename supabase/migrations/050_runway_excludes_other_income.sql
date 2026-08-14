-- Align the Cash Runway net burn with the app's income categories.
--
-- Every other surface treats income as {Income, Gift Money, Other Income} —
-- see INCOME_CATEGORY_NAMES in lib/category-filters.ts. This RPC has excluded
-- only the first two since migration 013, so `Other Income` was the one
-- category the app called income and runway counted as spend.
--
-- No rows currently carry that category, so this changes no figure today. It
-- is a consistency fix: category planning can create `Other Income`, and if a
-- row ever landed there runway would have diverged from every other total
-- without anything looking wrong.
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
    AND category NOT IN ('Income', 'Other Income', 'Excluded', 'Gift Money')
    -- Non-cash mark-to-market entries; see migration 049.
    AND LOWER(TRIM(COALESCE(counterparty, ''))) <> 'valuation change';
$$;
