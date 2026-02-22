-- Bulk replace transaction_log rows from Google Sheet in one round-trip.
-- Deletes existing google_sheet rows for the user, then inserts all rows from p_rows.
-- p_rows: JSON array of { date, category, counterparty, counterparty_dedup, amount_usd, amount_gbp, currency }.
-- date can be ISO date string (YYYY-MM-DD) or full ISO timestamp.
CREATE OR REPLACE FUNCTION sync_transaction_log_bulk(p_user_id uuid, p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  DELETE FROM transaction_log
  WHERE user_id = p_user_id AND data_source = 'google_sheet';

  IF jsonb_array_length(p_rows) > 0 THEN
    INSERT INTO transaction_log (user_id, date, category, counterparty, counterparty_dedup, amount_usd, amount_gbp, currency, data_source)
    SELECT
      p_user_id,
      (elem->>'date')::timestamptz::date,
      elem->>'category',
      NULLIF(trim(elem->>'counterparty'), ''),
      COALESCE(NULLIF(trim(elem->>'counterparty_dedup'), ''), ''),
      (elem->>'amount_usd')::numeric,
      (elem->>'amount_gbp')::numeric,
      NULLIF(trim(elem->>'currency'), ''),
      'google_sheet'
    FROM jsonb_array_elements(p_rows) AS elem;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION sync_transaction_log_bulk(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION sync_transaction_log_bulk(uuid, jsonb) TO service_role;
