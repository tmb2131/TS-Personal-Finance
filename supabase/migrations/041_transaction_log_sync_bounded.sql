-- Transaction log sync: support full replace (cron) vs bounded replace (manual).
-- p_full_replace true: delete all google_sheet rows, insert all p_rows (current behavior).
-- p_full_replace false: delete only last 1 week of google_sheet rows, insert all p_rows (caller sends last week only).
CREATE OR REPLACE FUNCTION sync_transaction_log_bulk(p_user_id uuid, p_rows jsonb, p_full_replace boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF p_full_replace THEN
    DELETE FROM transaction_log
    WHERE user_id = p_user_id AND data_source = 'google_sheet';
  ELSE
    DELETE FROM transaction_log
    WHERE user_id = p_user_id AND data_source = 'google_sheet'
      AND date >= (current_date - interval '1 week')::date;
  END IF;

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

GRANT EXECUTE ON FUNCTION sync_transaction_log_bulk(uuid, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION sync_transaction_log_bulk(uuid, jsonb, boolean) TO service_role;
