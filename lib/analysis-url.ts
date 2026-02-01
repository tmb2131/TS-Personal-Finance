/**
 * Build URL to Analysis page → Transaction Analysis section with optional period and category.
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
  return `/analysis?${search.toString()}`
}
