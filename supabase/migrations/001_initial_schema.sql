-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Account Balances Table
CREATE TABLE IF NOT EXISTS account_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    institution TEXT NOT NULL,
    account_name TEXT NOT NULL,
    category TEXT NOT NULL,
    currency TEXT NOT NULL CHECK (currency IN ('USD', 'GBP', 'EUR')),
    balance_personal_local NUMERIC(15, 2) DEFAULT 0,
    balance_family_local NUMERIC(15, 2) DEFAULT 0,
    balance_total_local NUMERIC(15, 2) NOT NULL,
    UNIQUE(institution, account_name, date_updated)
);

-- Transaction Log Table
CREATE TABLE IF NOT EXISTS transaction_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    category TEXT NOT NULL,
    counterparty TEXT,
    amount_usd NUMERIC(15, 2),
    amount_gbp NUMERIC(15, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Budget Targets Table
CREATE TABLE IF NOT EXISTS budget_targets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category TEXT NOT NULL UNIQUE,
    annual_budget_gbp NUMERIC(15, 2) DEFAULT 0,
    annual_budget_usd NUMERIC(15, 2) DEFAULT 0
);

-- Historical Net Worth Table
CREATE TABLE IF NOT EXISTS historical_net_worth (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    category TEXT NOT NULL,
    amount_usd NUMERIC(15, 2),
    amount_gbp NUMERIC(15, 2),
    UNIQUE(date, category)
);

-- FX Rates Table (Historical)
CREATE TABLE IF NOT EXISTS fx_rates (
    date DATE PRIMARY KEY,
    gbpusd_rate NUMERIC(10, 6),
    eurusd_rate NUMERIC(10, 6)
);

-- Current FX Rate Table
CREATE TABLE IF NOT EXISTS fx_rate_current (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    gbpusd_rate NUMERIC(10, 6) NOT NULL,
    UNIQUE(date)
);

-- Annual Trends Table
CREATE TABLE IF NOT EXISTS annual_trends (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category TEXT NOT NULL UNIQUE,
    cur_yr_minus_4 NUMERIC(15, 2) DEFAULT 0,
    cur_yr_minus_3 NUMERIC(15, 2) DEFAULT 0,
    cur_yr_minus_2 NUMERIC(15, 2) DEFAULT 0,
    cur_yr_minus_1 NUMERIC(15, 2) DEFAULT 0,
    cur_yr_est NUMERIC(15, 2) DEFAULT 0,
    cur_yr_est_vs_4yr_avg NUMERIC(15, 2) DEFAULT 0
);

-- Monthly Trends Table
CREATE TABLE IF NOT EXISTS monthly_trends (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category TEXT NOT NULL UNIQUE,
    cur_month_minus_3 NUMERIC(15, 2) DEFAULT 0,
    cur_month_minus_2 NUMERIC(15, 2) DEFAULT 0,
    cur_month_minus_1 NUMERIC(15, 2) DEFAULT 0,
    cur_month_est NUMERIC(15, 2) DEFAULT 0,
    ttm_avg NUMERIC(15, 2) DEFAULT 0,
    z_score NUMERIC(10, 4) DEFAULT 0,
    delta_vs_l3m NUMERIC(15, 2) DEFAULT 0
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_account_balances_date ON account_balances(date_updated DESC);
CREATE INDEX IF NOT EXISTS idx_account_balances_category ON account_balances(category);
CREATE INDEX IF NOT EXISTS idx_transaction_log_date ON transaction_log(date DESC);
CREATE INDEX IF NOT EXISTS idx_transaction_log_category ON transaction_log(category);
CREATE INDEX IF NOT EXISTS idx_historical_net_worth_date ON historical_net_worth(date DESC);
CREATE INDEX IF NOT EXISTS idx_historical_net_worth_category ON historical_net_worth(category);
CREATE INDEX IF NOT EXISTS idx_fx_rates_date ON fx_rates(date DESC);
