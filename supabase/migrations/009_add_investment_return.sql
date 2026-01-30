-- Investment Return: income source label and manual amount (from Google Sheet "Investment Return" tab)
-- Sheet columns: A = "Income Sources", B = "Manual" (e.g. "150.8K")
CREATE TABLE IF NOT EXISTS investment_return (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  income_source TEXT NOT NULL UNIQUE,
  amount_gbp NUMERIC(15, 2) DEFAULT 0
);
