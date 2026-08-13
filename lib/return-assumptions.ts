import type { ReturnProfile } from '@/lib/types'

export const DEFAULT_INFLATION_RATE = 0.03

export type ReturnAssumptions = {
  defaultNominalReturn: number
  nominalReturns: Record<string, number>
  /**
   * Effective tax on the return of each category, as a decimal. Optional so that
   * rows written before this field existed still parse; missing keys fall back to
   * `defaultEffectiveTaxRate`.
   */
  effectiveTaxRates?: Record<string, number>
  defaultEffectiveTaxRate?: number
}

export const RETURN_PROFILE_OPTIONS: ReturnProfile[] = [
  'Conservative',
  'Expected',
  'Base',
  'Optimistic',
]

export const ASSET_RETURN_CATEGORIES = [
  'Cash',
  'Checking',
  'Savings',
  'Brokerage',
  'Retirement',
  'Alt Inv',
  // Taconic split into its four distinct return profiles. A single blended rate
  // hid a 6.8pp spread between the restructured funds and the legacy wind-downs.
  'Taconic Credit Opps',
  'Taconic Merger Arb',
  'Taconic Opportunity',
  'Taconic Legacy',
  /** @deprecated Retained so pre-split stored assumptions still parse. */
  'Taconic',
  'House',
  'Property',
  'Other',
] as const

export type AssetReturnCategory = (typeof ASSET_RETURN_CATEGORIES)[number]

/** Categories surfaced in the settings UI. Excludes deprecated aliases. */
export const EDITABLE_RETURN_CATEGORIES = ASSET_RETURN_CATEGORIES.filter(
  (category) => category !== 'Taconic'
) as Exclude<AssetReturnCategory, 'Taconic'>[]

/**
 * Nominal returns are bounded but MAY be negative. A floor of zero cannot express
 * a drawdown year, which makes any "Conservative" profile built on it a low-return
 * scenario rather than a downside one.
 */
export const MAX_NOMINAL_RETURN = 0.5
export const MIN_NOMINAL_RETURN = -0.5

export const MAX_EFFECTIVE_TAX_RATE = 0.6

export const DEFAULT_EFFECTIVE_TAX_RATE = 0.3

/**
 * Effective tax on investment return by category. UK arising basis, US filer.
 * Retirement is zero because Roth withdrawals are untaxed and pension growth is
 * gross-rolled; House is zero on the assumption of main-residence relief.
 */
export const EFFECTIVE_TAX_RATES: Record<string, number> = {
  Cash: 0.45,
  Checking: 0.45,
  Savings: 0.45,
  Brokerage: 0.28,
  Retirement: 0.0,
  'Alt Inv': 0.2,
  // 45% assumes the funds are NOT UK reporting funds, so gains are taxed as
  // income rather than at CGT rates. If reporting-fund status is confirmed these
  // drop to roughly 0.238, worth about GBP 20k a year on the Base profile — more
  // than the spread between most of these scenarios.
  'Taconic Credit Opps': 0.45,
  'Taconic Merger Arb': 0.45,
  'Taconic Opportunity': 0.45,
  'Taconic Legacy': 0.45,
  Taconic: 0.45,
  House: 0.0,
  Property: 0.28,
  Other: 0.3,
}

export const RETURN_ASSUMPTIONS_BY_PROFILE: Record<ReturnProfile, ReturnAssumptions> = {
  // A genuine downside case: credit funds lose money in spread-widening years and
  // wind-down vehicles get marked below carrying value.
  Conservative: {
    defaultNominalReturn: 0.0,
    defaultEffectiveTaxRate: DEFAULT_EFFECTIVE_TAX_RATE,
    nominalReturns: {
      Cash: 0.02,
      Checking: 0.0,
      Savings: 0.02,
      Brokerage: 0.03,
      Retirement: 0.03,
      'Alt Inv': -0.1,
      'Taconic Credit Opps': -0.04,
      'Taconic Merger Arb': 0.0,
      'Taconic Opportunity': -0.03,
      'Taconic Legacy': -0.08,
      Taconic: -0.04,
      House: 0.0,
      Property: 0.0,
      Other: 0.0,
    },
    effectiveTaxRates: EFFECTIVE_TAX_RATES,
  },
  // Probability-weighted centre. Calibrated against realised attribution rather
  // than interpolated between the other two profiles: over the two quarters to
  // 30 Jun 2026 the restructured Taconic block returned +4.0% annualised and the
  // legacy dislocation vehicles -2.8%, for a blended Taconic 1.8%.
  Expected: {
    defaultNominalReturn: 0.03,
    defaultEffectiveTaxRate: DEFAULT_EFFECTIVE_TAX_RATE,
    nominalReturns: {
      Cash: 0.03,
      Checking: 0.0,
      Savings: 0.03,
      Brokerage: 0.065,
      Retirement: 0.065,
      'Alt Inv': 0.03,
      'Taconic Credit Opps': 0.055,
      'Taconic Merger Arb': 0.04,
      'Taconic Opportunity': 0.035,
      'Taconic Legacy': 0.005,
      Taconic: 0.033,
      House: 0.03,
      Property: 0.03,
      Other: 0.03,
    },
    effectiveTaxRates: EFFECTIVE_TAX_RATES,
  },
  Base: {
    defaultNominalReturn: 0.04,
    defaultEffectiveTaxRate: DEFAULT_EFFECTIVE_TAX_RATE,
    nominalReturns: {
      Cash: 0.03,
      Checking: 0.0,
      Savings: 0.03,
      Brokerage: 0.07,
      Retirement: 0.07,
      'Alt Inv': 0.06,
      'Taconic Credit Opps': 0.07,
      'Taconic Merger Arb': 0.05,
      'Taconic Opportunity': 0.045,
      'Taconic Legacy': 0.015,
      Taconic: 0.045,
      House: 0.04,
      Property: 0.04,
      Other: 0.04,
    },
    effectiveTaxRates: EFFECTIVE_TAX_RATES,
  },
  Optimistic: {
    defaultNominalReturn: 0.05,
    defaultEffectiveTaxRate: DEFAULT_EFFECTIVE_TAX_RATE,
    nominalReturns: {
      Cash: 0.038,
      Checking: 0.0,
      Savings: 0.038,
      Brokerage: 0.11,
      Retirement: 0.11,
      'Alt Inv': 0.09,
      'Taconic Credit Opps': 0.11,
      'Taconic Merger Arb': 0.085,
      'Taconic Opportunity': 0.08,
      'Taconic Legacy': 0.05,
      Taconic: 0.081,
      House: 0.05,
      Property: 0.05,
      Other: 0.05,
    },
    effectiveTaxRates: EFFECTIVE_TAX_RATES,
  },
}

export type AssetMixEntry = {
  category: string
  balance: number
}

export function cloneReturnAssumptions(assumptions: ReturnAssumptions): ReturnAssumptions {
  return {
    defaultNominalReturn: assumptions.defaultNominalReturn,
    nominalReturns: { ...assumptions.nominalReturns },
    effectiveTaxRates: assumptions.effectiveTaxRates
      ? { ...assumptions.effectiveTaxRates }
      : undefined,
    defaultEffectiveTaxRate: assumptions.defaultEffectiveTaxRate,
  }
}

/** Stored overrides, or the built-in preset for the selected profile when unset. */
export function resolveReturnAssumptions(
  profile: ReturnProfile,
  stored?: ReturnAssumptions | null
): ReturnAssumptions {
  return stored ?? cloneReturnAssumptions(RETURN_ASSUMPTIONS_BY_PROFILE[profile])
}

export function returnAssumptionsEqual(a: ReturnAssumptions, b: ReturnAssumptions): boolean {
  if (Math.abs(a.defaultNominalReturn - b.defaultNominalReturn) >= 1e-9) return false
  for (const category of ASSET_RETURN_CATEGORIES) {
    const av = a.nominalReturns[category] ?? a.defaultNominalReturn
    const bv = b.nominalReturns[category] ?? b.defaultNominalReturn
    if (Math.abs(av - bv) >= 1e-9) return false
    const at = getEffectiveTaxRate(a, category)
    const bt = getEffectiveTaxRate(b, category)
    if (Math.abs(at - bt) >= 1e-9) return false
  }
  return true
}

export function isValidReturnRate(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_NOMINAL_RETURN &&
    value <= MAX_NOMINAL_RETURN
  )
}

export function isValidTaxRate(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_EFFECTIVE_TAX_RATE
  )
}

/**
 * Missing categories now fall back to the default rather than failing the whole
 * parse. Without this, splitting `Taconic` into four categories would reject every
 * assumptions row written before the split.
 */
export function parseReturnAssumptions(value: unknown): ReturnAssumptions | null {
  if (value == null) return null
  if (typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  if (!isValidReturnRate(record.defaultNominalReturn)) return null
  if (
    typeof record.nominalReturns !== 'object' ||
    record.nominalReturns == null ||
    Array.isArray(record.nominalReturns)
  ) {
    return null
  }

  const defaultNominalReturn = record.defaultNominalReturn
  const defaultEffectiveTaxRate = isValidTaxRate(record.defaultEffectiveTaxRate)
    ? record.defaultEffectiveTaxRate
    : DEFAULT_EFFECTIVE_TAX_RATE

  const returnsRecord = record.nominalReturns as Record<string, unknown>
  const taxRecord =
    typeof record.effectiveTaxRates === 'object' &&
    record.effectiveTaxRates != null &&
    !Array.isArray(record.effectiveTaxRates)
      ? (record.effectiveTaxRates as Record<string, unknown>)
      : {}

  const nominalReturns: Record<string, number> = {}
  const effectiveTaxRates: Record<string, number> = {}

  for (const category of ASSET_RETURN_CATEGORIES) {
    const rate = returnsRecord[category]
    if (rate === undefined) {
      nominalReturns[category] = inferMissingCategoryRate(
        category,
        returnsRecord,
        defaultNominalReturn
      )
    } else if (isValidReturnRate(rate)) {
      nominalReturns[category] = rate
    } else {
      return null
    }

    const tax = taxRecord[category]
    effectiveTaxRates[category] = isValidTaxRate(tax)
      ? tax
      : (EFFECTIVE_TAX_RATES[category] ?? defaultEffectiveTaxRate)
  }

  return {
    defaultNominalReturn,
    nominalReturns,
    effectiveTaxRates,
    defaultEffectiveTaxRate,
  }
}

/**
 * Backfill rule for the Taconic split: a pre-split row carries one blended
 * `Taconic` rate, which is the best available estimate for each sub-fund until
 * the user edits them.
 */
function inferMissingCategoryRate(
  category: string,
  stored: Record<string, unknown>,
  fallback: number
): number {
  if (category.startsWith('Taconic') && isValidReturnRate(stored.Taconic)) {
    return stored.Taconic
  }
  return fallback
}

export function getEffectiveTaxRate(assumptions: ReturnAssumptions, category: string): number {
  const explicit = assumptions.effectiveTaxRates?.[category]
  if (isValidTaxRate(explicit)) return explicit
  const preset = EFFECTIVE_TAX_RATES[category]
  if (isValidTaxRate(preset)) return preset
  return assumptions.defaultEffectiveTaxRate ?? DEFAULT_EFFECTIVE_TAX_RATE
}

export function nominalToRealReturn(nominalReturn: number, inflationRate = DEFAULT_INFLATION_RATE) {
  return (1 + nominalReturn) / (1 + inflationRate) - 1
}

/** Balance-weighted nominal return for an asset mix under a return profile. */
export function weightedNominalReturn(assets: AssetMixEntry[], assumptions: ReturnAssumptions) {
  const total = assets.reduce((sum, asset) => sum + asset.balance, 0)
  if (total <= 0) return 0

  return assets.reduce((sum, asset) => {
    const rate = assumptions.nominalReturns[asset.category] ?? assumptions.defaultNominalReturn
    return sum + (asset.balance / total) * rate
  }, 0)
}

/**
 * Balance-weighted nominal return NET of tax. Tax is applied to gains only —
 * a negative return is not grossed up, because loss relief is neither guaranteed
 * nor available in the year the loss arises.
 */
export function weightedAfterTaxNominalReturn(
  assets: AssetMixEntry[],
  assumptions: ReturnAssumptions
) {
  const total = assets.reduce((sum, asset) => sum + asset.balance, 0)
  if (total <= 0) return 0

  return assets.reduce((sum, asset) => {
    const gross = assumptions.nominalReturns[asset.category] ?? assumptions.defaultNominalReturn
    const tax = getEffectiveTaxRate(assumptions, asset.category)
    const net = gross > 0 ? gross * (1 - tax) : gross
    return sum + (asset.balance / total) * net
  }, 0)
}

/** Balance-weighted real return for an asset mix under a return profile. */
export function weightedRealReturn(
  assets: AssetMixEntry[],
  assumptions: ReturnAssumptions,
  inflationRate = DEFAULT_INFLATION_RATE
) {
  return nominalToRealReturn(weightedNominalReturn(assets, assumptions), inflationRate)
}

/** Balance-weighted real return net of tax. This is the one the ceiling should use. */
export function weightedAfterTaxRealReturn(
  assets: AssetMixEntry[],
  assumptions: ReturnAssumptions,
  inflationRate = DEFAULT_INFLATION_RATE
) {
  return nominalToRealReturn(weightedAfterTaxNominalReturn(assets, assumptions), inflationRate)
}
