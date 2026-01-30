-- Recurring Payments Table (from Google Sheet)
CREATE TABLE IF NOT EXISTS recurring_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    annualized_amount_gbp NUMERIC(15, 2),
    annualized_amount_usd NUMERIC(15, 2),
    needs_review BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_recurring_payments_name ON recurring_payments(name);
CREATE INDEX IF NOT EXISTS idx_recurring_payments_needs_review ON recurring_payments(needs_review);
