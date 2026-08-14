/**
 * Build a URL to the Transaction Analysis section, which lives on /spending.
 *
 * This still pointed at `/analysis`, whose client-side redirect keys on the URL
 * fragment. These links carry `?section=` and no fragment, so every clickable
 * cell in the annual and monthly trends tables fell through to the fallback
 * and landed on /trends instead of the transactions it promised.
 */
export function buildTransactionAnalysisUrl(params: {
  period: 'YTD' | 'MTD'
  year: number
  month?: number
  category?: string
}): string {
  const search = new URLSearchParams()
  search.set('section', 'transaction-analysis')
  search.set('period', params.period)
  search.set('year', String(params.year))
  if (params.period === 'MTD' && params.month != null) {
    search.set('month', String(params.month))
  }
  if (params.category) {
    search.set('category', params.category)
  }
  return `/spending?${search.toString()}`
}
