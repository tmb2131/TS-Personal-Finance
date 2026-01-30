import { createClient } from '@/lib/supabase/server'
import { MonthlyTrendsTable } from './monthly-trends-table'
import { MonthlyTrend } from '@/lib/types'
import { endOfMonth, type RatesByMonthOffset } from '@/lib/utils/fx-rates'

async function fetchMonthlyTrendsData() {
  const supabase = await createClient()
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

  const [trendsResult, fxRatesResult, currentResult] = await Promise.all([
    supabase.from('monthly_trends').select('*').order('category'),
    supabase
      .from('fx_rates')
      .select('date, gbpusd_rate')
      .gte('date', eom3)
      .lte('date', eom0)
      .order('date', { ascending: true }),
    supabase.from('fx_rate_current').select('gbpusd_rate').limit(1).single(),
  ])

  if (trendsResult.error) {
    console.error('Error fetching monthly trends:', trendsResult.error)
    throw new Error('Failed to load monthly trends data')
  }

  const rows = (fxRatesResult.data || []) as { date: string; gbpusd_rate: number | null }[]
  const dateToRate = new Map<string, number>()
  rows.forEach((r) => {
    const d = (r.date || '').split('T')[0]
    if (r.gbpusd_rate != null && r.gbpusd_rate > 0) dateToRate.set(d, r.gbpusd_rate)
  })
  const sortedDates = Array.from(dateToRate.keys()).sort()
  const getRate = (dateStr: string) => {
    const prior = sortedDates.filter((d) => d <= dateStr).pop()
    return prior != null ? dateToRate.get(prior)! : (currentResult.data?.gbpusd_rate ?? 1.25)
  }
  const currentRate = currentResult.data?.gbpusd_rate ?? 1.25
  const ratesByMonth: RatesByMonthOffset = {
    current: sortedDates.length ? getRate(eom0) : currentRate,
    minus1: sortedDates.length ? getRate(eom1) : currentRate,
    minus2: sortedDates.length ? getRate(eom2) : currentRate,
    minus3: sortedDates.length ? getRate(eom3) : currentRate,
  }

  return {
    data: trendsResult.data as MonthlyTrend[],
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
