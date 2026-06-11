-- Financial assumptions for the sustainable spending range (floor + ceiling)
-- One row per user. Drives lib/sustainable-spend.ts and the Liquidity FI calculator.
CREATE TABLE IF NOT EXISTS financial_assumptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Return profile shared with the Liquidity FI calculator (per-asset-category nominal returns)
    return_profile TEXT NOT NULL DEFAULT 'Conservative'
      CHECK (return_profile IN ('Conservative', 'Base', 'Optimistic')),
    inflation_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.03
      CHECK (inflation_rate >= 0 AND inflation_rate <= 0.25),
    -- How the spending floor is derived
    floor_mode TEXT NOT NULL DEFAULT 'savings_rate'
      CHECK (floor_mode IN ('savings_rate', 'wealth_target')),
    target_savings_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.20
      CHECK (target_savings_rate >= 0 AND target_savings_rate <= 1),
    wealth_target_gbp NUMERIC(15, 2),
    wealth_target_usd NUMERIC(15, 2),
    horizon_years INTEGER NOT NULL DEFAULT 20
      CHECK (horizon_years >= 1 AND horizon_years <= 80),
    emergency_fund_months NUMERIC(5, 1) NOT NULL DEFAULT 6
      CHECK (emergency_fund_months >= 0 AND emergency_fund_months <= 60),
    include_trust BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE financial_assumptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_data" ON financial_assumptions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE financial_assumptions IS 'Per-user assumptions for sustainable spending range (floor + ceiling) and FI calculations';
COMMENT ON COLUMN financial_assumptions.return_profile IS 'Return assumption profile: Conservative, Base, or Optimistic';
COMMENT ON COLUMN financial_assumptions.floor_mode IS 'How the spending floor is derived: savings_rate or wealth_target';
COMMENT ON COLUMN financial_assumptions.target_savings_rate IS 'Fraction of income to save (floor_mode = savings_rate)';
COMMENT ON COLUMN financial_assumptions.wealth_target_gbp IS 'Net worth target in GBP (floor_mode = wealth_target)';
COMMENT ON COLUMN financial_assumptions.horizon_years IS 'Years to reach the wealth target';
COMMENT ON COLUMN financial_assumptions.emergency_fund_months IS 'Target months of cash runway before drawing on portfolio returns';
COMMENT ON COLUMN financial_assumptions.include_trust IS 'Include Trust accounts in sustainable spending net worth';
