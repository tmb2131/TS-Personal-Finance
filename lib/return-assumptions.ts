import type { ReturnProfile } from '@/lib/types'

export const DEFAULT_INFLATION_RATE = 0.03

export type ReturnAssumptions = {
  defaultNominalReturn: number
  nominalReturns: Record<string, number>
}

export const RETURN_PROFILE_OPTIONS: ReturnProfile[] = ['Conservative', 'Base', 'Optimistic']

export const RETURN_ASSUMPTIONS_BY_PROFILE: Record<ReturnProfile, ReturnAssumptions> = {
  Conservative: {
    defaultNominalReturn: 0.03,
    nominalReturns: {
      Cash: 0.02,
      Checking: 0.02,
      Savings: 0.02,
      Brokerage: 0.06,
      Retirement: 0.06,
      'Alt Inv': 0.05,
      Taconic: 0.05,
      House: 0.03,
      Property: 0.03,
      Other: 0.03,
    },
  },
  Base: {
    defaultNominalReturn: 0.04,
    nominalReturns: {
      Cash: 0.03,
      Checking: 0.03,
      Savings: 0.03,
      Brokerage: 0.07,
      Retirement: 0.07,
      'Alt Inv': 0.06,
      Taconic: 0.06,
      House: 0.04,
      Property: 0.04,
      Other: 0.04,
    },
  },
  Optimistic: {
    defaultNominalReturn: 0.05,
    nominalReturns: {
      Cash: 0.04,
      Checking: 0.04,
      Savings: 0.04,
      Brokerage: 0.08,
      Retirement: 0.08,
      'Alt Inv': 0.07,
      Taconic: 0.07,
      House: 0.05,
      Property: 0.05,
      Other: 0.05,
    },
  },
}

export type AssetMixEntry = {
  category: string
  balance: number
}

export function nominalToRealReturn(nominalReturn: number, inflationRate = DEFAULT_INFLATION_RATE) {
  return (1 + nominalReturn) / (1 + inflationRate) - 1
}

/** Balance-weighted real return for an asset mix under a return profile. */
export function weightedRealReturn(
  assets: AssetMixEntry[],
  assumptions: ReturnAssumptions,
  inflationRate = DEFAULT_INFLATION_RATE
) {
  const total = assets.reduce((sum, asset) => sum + asset.balance, 0)
  if (total <= 0) return 0

  const weightedNominal = assets.reduce((sum, asset) => {
    const rate = assumptions.nominalReturns[asset.category] ?? assumptions.defaultNominalReturn
    return sum + (asset.balance / total) * rate
  }, 0)

  return nominalToRealReturn(weightedNominal, inflationRate)
}

export function computeYearsUntilDepletion(
  portfolio: number,
  annualWithdrawal: number,
  realReturn: number,
  maxYears = 100
) {
  if (annualWithdrawal <= 0) return maxYears
  if (portfolio <= 0) return 0

  let balance = portfolio
  for (let year = 1; year <= maxYears; year++) {
    balance = balance * (1 + realReturn) - annualWithdrawal
    if (balance <= 0) return year
  }

  return maxYears
}
