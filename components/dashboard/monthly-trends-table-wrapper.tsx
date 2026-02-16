import { createClient } from '@/lib/supabase/server'
import { MonthlyTrendsTable } from './monthly-trends-table'
import { MonthlyTrend } from '@/lib/types'
import { endOfMonth, type RatesByMonthOffset } from '@/lib/utils/fx-rates'
import { computeMonthlyTrends } from '@/lib/forecasting'
import { fetchFxRatesRange, fetchCurrentFxRate, fetchCurrentUser } from '@/lib/data/cached-queries'

async function fetchMonthlyTrendsData() {
  const user = await fetchCurrentUser()
  const userId = user?.id ?? null
  const now = new Date()
  let y = now.getFullYear()
  let m = now.getMonth() + 1 // 1-based

  const monthAgo = (monthsBack: number) => {
    let mm = m - monthsBack
    let yy = y
    while (mm <= 0) {
      mm += 12
      yy -= 1
    }
    return endOfMonth(yy, mm)
  }
  const eom3 = monthAgo(3)
  const eom2 = monthAgo(2)
  const eom1 = monthAgo(1)
  const eom0 = endOfMonth(y, m)

  const [trendsResult, fxRows, currentRate] = await Promise.all([
    userId
      ? createClient().then((supabase) => computeMonthlyTrends(supabase, userId))
      : Promise.resolve([]),
    fetchFxRatesRange(eom3, eom0),
    fetchCurrentFxRate(),
  ])

  const trends = Array.isArray(trendsResult) ? trendsResult : []

  const dateToRate = new Map<string, number>()
  fxRows.forEach((r) => {
    const d = (r.date || '').split('T')[0]
    if (r.gbpusd_rate != null && r.gbpusd_rate > 0) dateToRate.set(d, r.gbpusd_rate)
  })
  const sortedDates = Array.from(dateToRate.keys()).sort()
  const getRate = (dateStr: string) => {
    const prior = sortedDates.filter((d) => d <= dateStr).pop()
    return prior != null ? dateToRate.get(prior)! : currentRate
  }
  const ratesByMonth: RatesByMonthOffset = {
    current: sortedDates.length ? getRate(eom0) : currentRate,
    minus1: sortedDates.length ? getRate(eom1) : currentRate,
    minus2: sortedDates.length ? getRate(eom2) : currentRate,
    minus3: sortedDates.length ? getRate(eom3) : currentRate,
  }

  return {
    data: trends as MonthlyTrend[],
    ratesByMonth,
  }
}

export async function MonthlyTrendsTableWrapper() {
  try {
    const { data, ratesByMonth } = await fetchMonthlyTrendsData()
    return <MonthlyTrendsTable initialData={data} initialRatesByMonth={ratesByMonth} />
  } catch (error) {
    return (
      <div className="text-sm text-destructive p-4">
        Failed to load monthly trends data. Please try refreshing the page.
      </div>
    )
  }
}
