-- Kids Accounts Table
-- Structure matches Google Sheet: Child, Account Type, USD value, Date, Notes, Purpose
CREATE TABLE IF NOT EXISTS kids_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    balance_usd NUMERIC(15, 2) NOT NULL,
    date_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    notes TEXT,
    purpose TEXT,
    UNIQUE(child_name, account_type, date_updated)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_kids_accounts_date ON kids_accounts(date_updated DESC);
CREATE INDEX IF NOT EXISTS idx_kids_accounts_account_type ON kids_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_kids_accounts_child_name ON kids_accounts(child_name);
