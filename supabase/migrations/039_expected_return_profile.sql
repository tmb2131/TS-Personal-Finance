-- Adds the 'Expected' return profile.
--
-- Context: the previous three profiles were all non-negative, which made
-- "Conservative" a low-return case rather than a downside case. Expected sits
-- between Conservative and Base as the probability-weighted centre.
--
-- Effective tax rates per category are stored inside the existing
-- nominal_return_assumptions JSONB column, so no schema change is needed for
-- them. Rows written before this migration parse unchanged: missing keys fall
-- back to presets in lib/return-assumptions.ts.

ALTER TABLE financial_assumptions
  DROP CONSTRAINT IF EXISTS financial_assumptions_return_profile_check;

ALTER TABLE financial_assumptions
  ADD CONSTRAINT financial_assumptions_return_profile_check
  CHECK (return_profile IN ('Conservative', 'Expected', 'Base', 'Optimistic'));

COMMENT ON COLUMN financial_assumptions.return_profile IS
  'Return assumption profile: Conservative (downside), Expected (central), Base, or Optimistic';
