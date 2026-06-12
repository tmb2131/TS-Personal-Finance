-- Whether the wealth target is expressed in real (today's money) or nominal (future) terms.
ALTER TABLE financial_assumptions
  ADD COLUMN IF NOT EXISTS wealth_target_terms TEXT NOT NULL DEFAULT 'real'
    CHECK (wealth_target_terms IN ('real', 'nominal'));

COMMENT ON COLUMN financial_assumptions.wealth_target_terms IS
  'Wealth target denomination: real = purchasing power at horizon; nominal = future account value';
