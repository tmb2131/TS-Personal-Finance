import type { WealthTargetTerms } from '@/lib/types'

export const WEALTH_TARGET_TERMS_OPTIONS: { value: WealthTargetTerms; label: string }[] = [
  { value: 'real', label: "Today's money" },
  { value: 'nominal', label: 'Nominal at horizon' },
]

export function wealthTargetTermsShortLabel(terms: WealthTargetTerms): string {
  return terms === 'real' ? "today's money" : 'nominal at horizon'
}

export function wealthTargetTermsHelper(terms: WealthTargetTerms): string {
  return terms === 'real'
    ? "Purchasing power at the horizon (real terms). Projections use returns after inflation."
    : 'Nominal account value at the horizon. Projections use pre-inflation returns.'
}

export function wealthTargetInputLabel(symbol: string, terms: WealthTargetTerms): string {
  return `Wealth target (${symbol}, ${wealthTargetTermsShortLabel(terms)})`
}
