-- Replace ensure_user_profile to avoid xmax (undocumented; can fail on some Postgres/Supabase setups).
-- Use INSERT then catch unique_violation and UPDATE so we know is_new without system columns.

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
  RETURNING user_profiles.id, user_profiles.email, user_profiles.google_spreadsheet_id, true;
EXCEPTION
  WHEN unique_violation THEN
    RETURN QUERY
    UPDATE user_profiles
    SET email = p_email, updated_at = now()
    WHERE user_profiles.id = p_id
    RETURNING user_profiles.id, user_profiles.email, user_profiles.google_spreadsheet_id, false;
END;
$$;
