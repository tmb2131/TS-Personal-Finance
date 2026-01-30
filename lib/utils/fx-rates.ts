import { SupabaseClient } from '@supabase/supabase-js'

export type FxRatesRow = { date: string; gbpusd_rate: number | null }

/** Year -> GBPUSD rate at end of that year (for annual trends) */
export type RatesByYear = Record<number, number>

/** Rates at end of current month (latest) and end of 1/2/3 months ago (for monthly trends) */
export type RatesByMonthOffset = { current: number; minus1: number; minus2: number; minus3: number }

/**
 * Fetch historical FX rates from fx_rates table for dates <= maxDate.
 * Returns a map of date string (YYYY-MM-DD) to gbpusd_rate (USD per 1 GBP).
 * Used to get rate for a specific date: use the rate for that date, or the most recent prior date.
 */
export async function fetchFxRatesUpTo(
  supabase: SupabaseClient,
  maxDate: string
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('fx_rates')
    .select('date, gbpusd_rate')
    .lte('date', maxDate)
    .order('date', { ascending: false })

  if (error || !data) return new Map()

  const map = new Map<string, number>()
  ;(data as FxRatesRow[]).forEach((row) => {
    const rate = row.gbpusd_rate
    if (rate != null && rate > 0) {
      const d = typeof row.date === 'string' ? row.date.split('T')[0] : row.date
      if (!map.has(d)) map.set(d, rate)
    }
  })
  return map
}

/**
 * Fetch FX rates for a date range (minDate <= date <= maxDate).
 * Returns a map of date string to gbpusd_rate.
 */
export async function fetchFxRatesForRange(
  supabase: SupabaseClient,
  minDate: string,
  maxDate: string
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('fx_rates')
    .select('date, gbpusd_rate')
    .gte('date', minDate)
    .lte('date', maxDate)
    .order('date', { ascending: true })

  if (error || !data) return new Map()

  const map = new Map<string, number>()
  ;(data as FxRatesRow[]).forEach((row) => {
    const rate = row.gbpusd_rate
    if (rate != null && rate > 0) {
      const d = typeof row.date === 'string' ? row.date.split('T')[0] : row.date
      map.set(d, rate)
    }
  })
  return map
}

/**
 * Build a function that returns the GBPUSD rate for a given date.
 * Uses the rate for that date if available, otherwise the most recent prior date in the map,
 * otherwise the fallback (current) rate.
 */
export function buildGetRateForDate(
  ratesByDate: Map<string, number>,
  fallbackRate: number
): (dateStr: string) => number {
  const sortedDates = Array.from(ratesByDate.keys()).sort()
  return (dateStr: string) => {
    const d = dateStr.split('T')[0]
    if (ratesByDate.has(d)) return ratesByDate.get(d)!
    const prior = sortedDates.filter((x) => x <= d).pop()
    return prior != null ? ratesByDate.get(prior)! : fallbackRate
  }
}

/** Last day of year as YYYY-MM-DD */
export function endOfYear(year: number): string {
  return `${year}-12-31`
}

/** Last day of month as YYYY-MM-DD (month 1-12) */
export function endOfMonth(year: number, month: number): string {
  const lastDay = new Date(year, month, 0).getDate()
  const m = String(month).padStart(2, '0')
  const d = String(lastDay).padStart(2, '0')
  return `${year}-${m}-${d}`
}
