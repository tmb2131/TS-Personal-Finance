-- One burn, not two.
--
-- `get_cash_runway_net_burn` returns spend split by the currency the
-- counterparty happened to bill in: GBP rows summed in sterling, USD rows
-- summed in dollars. The Cash Runway card divided each currency's cash by that
-- currency's spend and showed the two results side by side at equal weight,
-- which made "USD runway 54.7 months" a headline figure. It was never a fact
-- about liquidity — the household spends in sterling, and the dollar balances
-- are sterling-in-waiting. The denominator was an artefact of billing currency.
--
-- Every transaction_log row carries both amount_gbp and amount_usd, so the
-- currency-independent burn is simply SUM(amount_gbp) across all expense rows
-- regardless of the row's own currency. That is the one denominator both
-- runway framings now share.
--
-- Filters match get_cash_runway_net_burn exactly (migrations 049 and 050):
-- income categories out, non-cash mark-to-market counterparties out. The old
-- function is left in place; the AI assistant's runway tool still calls it.
CREATE OR REPLACE FUNCTION get_cash_runway_total_burn(p_start date, p_end date)
RETURNS TABLE (total_gbp_net numeric)
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(amount_gbp), 0)
  FROM transaction_log
  WHERE date >= p_start AND date <= p_end
    AND category NOT IN ('Income', 'Other Income', 'Excluded', 'Gift Money')
    AND LOWER(TRIM(COALESCE(counterparty, ''))) <> 'valuation change';
$$;

-- SECURITY INVOKER (the default), so RLS on transaction_log does the scoping —
-- same posture and same default grants as get_cash_runway_net_burn.
COMMENT ON FUNCTION get_cash_runway_total_burn(date, date) IS
  'Net cash burn in GBP across all currencies for a date range. Currency-independent denominator for cash runway.';
