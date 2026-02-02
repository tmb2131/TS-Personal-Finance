-- Fix "Auth RLS Initialization Plan" warnings: use a STABLE SECURITY DEFINER
-- function so auth.uid() is evaluated once per query instead of per row.

CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid();
$$;

-- user_profiles (policy created in 017)
DROP POLICY IF EXISTS "users_own_profile" ON user_profiles;
CREATE POLICY "users_own_profile" ON user_profiles
  FOR ALL USING (current_user_id() = id) WITH CHECK (current_user_id() = id);

-- Tables with user_id (policies from 018)
DROP POLICY IF EXISTS "user_own_data" ON account_balances;
CREATE POLICY "user_own_data" ON account_balances
  FOR ALL TO authenticated USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());

DROP POLICY IF EXISTS "user_own_data" ON transaction_log;
CREATE POLICY "user_own_data" ON transaction_log
  FOR ALL TO authenticated USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());

DROP POLICY IF EXISTS "user_own_data" ON budget_targets;
CREATE POLICY "user_own_data" ON budget_targets
  FOR ALL TO authenticated USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());

DROP POLICY IF EXISTS "user_own_data" ON historical_net_worth;
CREATE POLICY "user_own_data" ON historical_net_worth
  FOR ALL TO authenticated USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());

DROP POLICY IF EXISTS "user_own_data" ON annual_trends;
CREATE POLICY "user_own_data" ON annual_trends
  FOR ALL TO authenticated USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());

DROP POLICY IF EXISTS "user_own_data" ON monthly_trends;
CREATE POLICY "user_own_data" ON monthly_trends
  FOR ALL TO authenticated USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());

DROP POLICY IF EXISTS "user_own_data" ON yoy_net_worth;
CREATE POLICY "user_own_data" ON yoy_net_worth
  FOR ALL TO authenticated USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());

DROP POLICY IF EXISTS "user_own_data" ON recurring_preferences;
CREATE POLICY "user_own_data" ON recurring_preferences
  FOR ALL TO authenticated USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());

DROP POLICY IF EXISTS "user_own_data" ON recurring_payments;
CREATE POLICY "user_own_data" ON recurring_payments
  FOR ALL TO authenticated USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());

DROP POLICY IF EXISTS "user_own_data" ON kids_accounts;
CREATE POLICY "user_own_data" ON kids_accounts
  FOR ALL TO authenticated USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());

DROP POLICY IF EXISTS "user_own_data" ON investment_return;
CREATE POLICY "user_own_data" ON investment_return
  FOR ALL TO authenticated USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());

DROP POLICY IF EXISTS "user_own_data" ON budget_history;
CREATE POLICY "user_own_data" ON budget_history
  FOR ALL TO authenticated USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());

DROP POLICY IF EXISTS "user_own_data" ON sync_metadata;
CREATE POLICY "user_own_data" ON sync_metadata
  FOR ALL TO authenticated USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());
