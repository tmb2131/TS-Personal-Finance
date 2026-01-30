-- Recurring Preferences Table
-- Stores user preferences for marking counterparties as "Not a recurring payment"
CREATE TABLE IF NOT EXISTS recurring_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    counterparty_pattern TEXT NOT NULL,
    is_ignored BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(counterparty_pattern)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_recurring_preferences_pattern ON recurring_preferences(counterparty_pattern);
CREATE INDEX IF NOT EXISTS idx_recurring_preferences_ignored ON recurring_preferences(is_ignored);
