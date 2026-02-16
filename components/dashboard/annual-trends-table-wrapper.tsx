import { createClient } from '@/lib/supabase/server'
import { AnnualTrendsTable } from '@/components/analysis/annual-trends-table'
import { AnnualTrend } from '@/lib/types'
import { endOfYear, type RatesByYear } from '@/lib/utils/fx-rates'
import { computeAnnualTrends } from '@/lib/forecasting'
import { fetchFxRatesRange, fetchCurrentFxRate, fetchCurrentUser } from '@/lib/data/cached-queries'

async function fetchAnnualTrendsData() {
  const currentYear = new Date().getFullYear()
  const user = await fetchCurrentUser()
  const userId = user?.id ?? null

  const minDate = endOfYear(currentYear - 4)
  const maxDate = endOfYear(currentYear)

  const [trendsResult, fxRows] = await Promise.all([
    userId
      ? createClient().then((supabase) => computeAnnualTrends(supabase, userId))
      : Promise.resolve([]),
    fetchFxRatesRange(minDate, maxDate),
  ])

  const trends = Array.isArray(trendsResult) ? trendsResult : []

  // Build year -> rate (rate at end of that year: EoY date or most recent prior)
  const ratesByYear: RatesByYear = {}
  const dateToRate = new Map<string, number>()
  fxRows.forEach((r) => {
    const d = (r.date || '').split('T')[0]
    if (r.gbpusd_rate != null && r.gbpusd_rate > 0) dateToRate.set(d, r.gbpusd_rate)
  })
  const sortedDates = Array.from(dateToRate.keys()).sort()
  for (let y = currentYear - 4; y <= currentYear; y++) {
    const eoy = endOfYear(y)
    const prior = sortedDates.filter((d) => d <= eoy).pop()
    ratesByYear[y] = prior != null ? dateToRate.get(prior)! : 1.25
  }
  if (sortedDates.length === 0) {
    const r = await fetchCurrentFxRate()
    for (let y = currentYear - 4; y <= currentYear; y++) ratesByYear[y] = r
  }

  return {
    trends: trends as AnnualTrend[],
    ratesByYear,
  }
}

export async function AnnualTrendsTableWrapper() {
  try {
    const { trends, ratesByYear } = await fetchAnnualTrendsData()
    return <AnnualTrendsTable initialData={trends} initialRatesByYear={ratesByYear} />
  } catch (error) {
    return (
      <div className="text-sm text-destructive p-4">
        Failed to load annual trends data. Please try refreshing the page.
      </div>
    )
  }
}
