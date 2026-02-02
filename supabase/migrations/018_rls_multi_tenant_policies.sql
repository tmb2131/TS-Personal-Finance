-- RLS: restrict access by user_id so each user only sees/writes their own rows.
-- FX tables (fx_rates, fx_rate_current) stay global (authenticated full access).
-- Cron and sync use service role (admin) client, which bypasses RLS.

-- Tables with user_id: drop old policy, create user-scoped policy
DROP POLICY IF EXISTS "authenticated_full_access" ON account_balances;
CREATE POLICY "user_own_data" ON account_balances
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "authenticated_full_access" ON transaction_log;
CREATE POLICY "user_own_data" ON transaction_log
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "authenticated_full_access" ON budget_targets;
CREATE POLICY "user_own_data" ON budget_targets
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "authenticated_full_access" ON historical_net_worth;
CREATE POLICY "user_own_data" ON historical_net_worth
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "authenticated_full_access" ON annual_trends;
CREATE POLICY "user_own_data" ON annual_trends
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "authenticated_full_access" ON monthly_trends;
CREATE POLICY "user_own_data" ON monthly_trends
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "authenticated_full_access" ON yoy_net_worth;
CREATE POLICY "user_own_data" ON yoy_net_worth
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "authenticated_full_access" ON recurring_preferences;
CREATE POLICY "user_own_data" ON recurring_preferences
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "authenticated_full_access" ON recurring_payments;
CREATE POLICY "user_own_data" ON recurring_payments
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "authenticated_full_access" ON kids_accounts;
CREATE POLICY "user_own_data" ON kids_accounts
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "authenticated_full_access" ON investment_return;
CREATE POLICY "user_own_data" ON investment_return
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "authenticated_full_access" ON budget_history;
CREATE POLICY "user_own_data" ON budget_history
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "authenticated_full_access" ON sync_metadata;
CREATE POLICY "user_own_data" ON sync_metadata
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- FX tables: keep global (no user_id); authenticated can read/write all
-- (policies unchanged: authenticated_full_access)
