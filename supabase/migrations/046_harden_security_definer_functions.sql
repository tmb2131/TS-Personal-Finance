-- Security hardening for the two SECURITY DEFINER functions that bypass RLS.
--
-- 1. ensure_user_profile() accepted an arbitrary p_id with no check that it
--    matched the caller. Because it is SECURITY DEFINER (bypasses RLS) and is
--    granted to `authenticated`, any signed-in user could call it via PostgREST
--    with another user's UUID to read back that user's google_spreadsheet_id,
--    overwrite their email, or create profile rows for arbitrary UUIDs.
--    Now it refuses any p_id that is not the caller's own auth.uid().
--
-- 2. distinct_categories() was missing `SET search_path`, unlike every other
--    SECURITY DEFINER function here, leaving a search_path hijack vector.

-- Body is otherwise unchanged from 039 (INSERT + catch unique_violation, no xmax).
CREATE OR REPLACE FUNCTION ensure_user_profile(p_id uuid, p_email text)
RETURNS TABLE (id uuid, email text, google_spreadsheet_id text, is_new boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Callers may only ever provision their own profile row.
  IF auth.uid() IS NULL OR p_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'ensure_user_profile: p_id must match the authenticated user'
      USING ERRCODE = '42501';
  END IF;

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

-- The auth callback is the only caller and runs with the user's session, so
-- service_role no longer needs (and must not have) a way to pass an arbitrary id.
REVOKE EXECUTE ON FUNCTION ensure_user_profile(uuid, text) FROM service_role;

-- Add the missing search_path; body unchanged from 026.
CREATE OR REPLACE FUNCTION distinct_categories()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select distinct category from (
    select category, user_id from budget_targets
    union all
    select category, user_id from transaction_log
  ) t
  where t.user_id = auth.uid()
  and t.category is not null
  order by category;
$$;

GRANT EXECUTE ON FUNCTION distinct_categories() TO authenticated;
