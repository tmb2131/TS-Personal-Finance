-- Enable Row Level Security (RLS) on all public tables exposed to PostgREST.
-- Policy: only authenticated users (allowlist enforced at login) can read/write.
-- Cron and sync use service role (admin) client, which bypasses RLS.

ALTER TABLE account_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_net_worth ENABLE ROW LEVEL SECURITY;
ALTER TABLE fx_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE fx_rate_current ENABLE ROW LEVEL SECURITY;
ALTER TABLE annual_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE yoy_net_worth ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE kids_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_return ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_metadata ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users only (anon key with no session gets no rows).
CREATE POLICY "authenticated_full_access" ON account_balances
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON transaction_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON budget_targets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON historical_net_worth
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON fx_rates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON fx_rate_current
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON annual_trends
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON monthly_trends
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON yoy_net_worth
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON recurring_preferences
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON recurring_payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON kids_accounts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON investment_return
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON budget_history
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON sync_metadata
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
