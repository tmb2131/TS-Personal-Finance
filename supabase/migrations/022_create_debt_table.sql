-- Debt tracking table with Type, Name, Purpose, and dual currency amounts
CREATE TABLE IF NOT EXISTS debt (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- Debt type: 'Mortgage', 'Credit Card', 'Personal Loan', 'Auto Loan', etc.
    name TEXT NOT NULL, -- Account/debt name
    purpose TEXT, -- Description/purpose of the debt
    amount_gbp NUMERIC(15, 2), -- Debt amount in GBP
    amount_usd NUMERIC(15, 2), -- Debt amount in USD
    date_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT debt_user_name_date_key
      UNIQUE (user_id, name, date_updated)
);

-- Enable RLS
ALTER TABLE debt ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only access their own debt records
CREATE POLICY "user_own_data" ON debt
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_debt_user_date ON debt(user_id, date_updated DESC);
CREATE INDEX IF NOT EXISTS idx_debt_type ON debt(type);
CREATE INDEX IF NOT EXISTS idx_debt_name ON debt(name);

-- Comments
COMMENT ON TABLE debt IS 'User debt tracking with dual currency support';
COMMENT ON COLUMN debt.type IS 'Debt category: Mortgage, Credit Card, Personal Loan, etc.';
COMMENT ON COLUMN debt.name IS 'Account or debt name';
COMMENT ON COLUMN debt.purpose IS 'Description or purpose of the debt';
COMMENT ON COLUMN debt.amount_gbp IS 'Outstanding balance in GBP';
COMMENT ON COLUMN debt.amount_usd IS 'Outstanding balance in USD';
