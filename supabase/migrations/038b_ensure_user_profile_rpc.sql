-- RPC to upsert user_profiles in one round trip and return whether the row was newly inserted.
-- Used by auth callback to avoid separate select + upsert; is_new drives background sync for new users.
-- xmax = 0 indicates the row was inserted (not updated).

CREATE OR REPLACE FUNCTION ensure_user_profile(p_id uuid, p_email text)
RETURNS TABLE (id uuid, email text, google_spreadsheet_id text, is_new boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO user_profiles (id, email, updated_at, google_spreadsheet_id)
  VALUES (
    p_id,
    p_email,
    now(),
    '1BxVuJ-DViN5nqpLc-8tGXex_pYiPY8dfL8UV5czCrHY'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = EXCLUDED.updated_at
  RETURNING
    user_profiles.id,
    user_profiles.email,
    user_profiles.google_spreadsheet_id,
    (user_profiles.xmax = 0) AS is_new;
END;
$$;

-- Allow authenticated users to call (callback runs with session after exchangeCodeForSession)
GRANT EXECUTE ON FUNCTION ensure_user_profile(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION ensure_user_profile(uuid, text) TO service_role;
