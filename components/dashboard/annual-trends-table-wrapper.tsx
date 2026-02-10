import { createClient } from '@/lib/supabase/server'
import { AnnualTrendsTable } from '@/components/analysis/annual-trends-table'
import { AnnualTrend } from '@/lib/types'
import { endOfYear, type RatesByYear } from '@/lib/utils/fx-rates'
import { computeAnnualTrends } from '@/lib/forecasting'

async function fetchAnnualTrendsData() {
  const supabase = await createClient()
  const currentYear = new Date().getFullYear()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? null

  const [trendsResult, fxRatesResult] = await Promise.all([
    userId ? computeAnnualTrends(supabase, userId) : Promise.resolve([]),
    supabase
      .from('fx_rates')
      .select('date, gbpusd_rate')
      .gte('date', endOfYear(currentYear - 4))
      .lte('date', endOfYear(currentYear))
      .order('date', { ascending: true }),
  ])

  const trends = Array.isArray(trendsResult) ? trendsResult : []

  // Build year -> rate (rate at end of that year: EoY date or most recent prior)
  const ratesByYear: RatesByYear = {}
  const rows = (fxRatesResult.data || []) as { date: string; gbpusd_rate: number | null }[]
  const dateToRate = new Map<string, number>()
  rows.forEach((r) => {
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
    const current = await supabase.from('fx_rate_current').select('gbpusd_rate').limit(1).single()
    const r = current.data?.gbpusd_rate ?? 1.25
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
