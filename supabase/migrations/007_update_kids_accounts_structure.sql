-- Update Kids Accounts Table Structure
-- This migration drops the old structure and creates the new one matching the Google Sheet format

-- Drop old indexes first
DROP INDEX IF EXISTS idx_kids_accounts_date;
DROP INDEX IF EXISTS idx_kids_accounts_category;
DROP INDEX IF EXISTS idx_kids_accounts_child_name;

-- Drop the old table (this will delete existing data - make sure to sync from Google Sheet after)
DROP TABLE IF EXISTS kids_accounts;

-- Create the new table structure matching Google Sheet: Child, Account Type, USD value, Date, Notes, Purpose
-- Unique constraint includes notes to allow multiple accounts of same type for same child on same date
CREATE TABLE kids_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    balance_usd NUMERIC(15, 2) NOT NULL,
    date_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    notes TEXT,
    purpose TEXT,
    UNIQUE(child_name, account_type, date_updated, notes)
);

-- Create indexes for better query performance
CREATE INDEX idx_kids_accounts_date ON kids_accounts(date_updated DESC);
CREATE INDEX idx_kids_accounts_account_type ON kids_accounts(account_type);
CREATE INDEX idx_kids_accounts_child_name ON kids_accounts(child_name);
