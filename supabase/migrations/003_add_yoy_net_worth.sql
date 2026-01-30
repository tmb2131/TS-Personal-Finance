-- YoY Net Worth Table
CREATE TABLE IF NOT EXISTS yoy_net_worth (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category TEXT NOT NULL UNIQUE,
    amount_usd NUMERIC(15, 2),
    amount_gbp NUMERIC(15, 2)
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_yoy_net_worth_category ON yoy_net_worth(category);
