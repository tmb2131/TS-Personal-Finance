import { computeManualYearForecast } from '@/lib/forecasting'
import type {
  CategoryForecastSnapshot,
  SnapshotByCategory,
} from '@/lib/forecast-evolution'
import {
  dayOfYearFromCalendarDate,
  totalDaysInCalendarYear,
} from '@/lib/forecast-evolution'
import { toLocalDateString } from '@/lib/daily-summary-utils'

const INCOME_CATEGORIES = ['Income', 'Gift Money', 'Other Income', 'Excluded']

const isExpenseCategory = (category: string) => !INCOME_CATEGORIES.includes(category)

export function addCalendarDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return toLocalDateString(date)
}

export function pctElapsedForCalendarDate(dateStr: string): number {
  const total = totalDaysInCalendarYear(dateStr)
  return Math.min(Math.max(dayOfYearFromCalendarDate(dateStr) / total, 0), 1)
}

export function computeCategoryForecastAtPct(
  row: Pick<
    CategoryForecastSnapshot,
    'annualBudget' | 'yearMethod' | 'manualYearForecast'
  >,
  ytd: number,
  pctElapsed: number,
  expense: boolean
): number {
  const { annualBudget, yearMethod, manualYearForecast } = row
  if (yearMethod === 'Manual') {
    return computeManualYearForecast(manualYearForecast, ytd, expense)
  }
  if (yearMethod === 'Annual') {
    return ytd + annualBudget * (1 - pctElapsed)
  }
  if (yearMethod === 'Linear') {
    return pctElapsed > 0 ? ytd / pctElapsed : ytd
  }
  if (yearMethod === 'Budget') {
    return expense ? Math.min(annualBudget, ytd) : Math.max(annualBudget, ytd)
  }
  return ytd
}

/** Sum expense forecasts — same aggregation as forecast bridge (raw forecast, not abs). */
export function sumExpenseForecastFromSnapshot(snapshot: SnapshotByCategory): number {
  let total = 0
  for (const [category, values] of snapshot) {
    if (!isExpenseCategory(category)) continue
    total += values.forecast
  }
  return total
}

/** Sum expense gap (budget − forecast) per category. */
export function sumExpenseGapFromSnapshot(snapshot: SnapshotByCategory): number {
  let total = 0
  for (const [category, values] of snapshot) {
    if (!isExpenseCategory(category)) continue
    total += values.gap
  }
  return total
}

/**
 * Total expense forecast at start of calendar day: today's day fraction, YTD excluding that day's spend.
 */
export function computeStartOfDayExpenseForecast(
  todaySnapshot: SnapshotByCategory,
  localTodayStr: string,
  todaySpendByCategory: Map<string, number>
): number {
  const pctToday = pctElapsedForCalendarDate(localTodayStr)
  let total = 0
  for (const [category, values] of todaySnapshot) {
    if (!isExpenseCategory(category)) continue
    const todaySpend = todaySpendByCategory.get(category) ?? 0
    const ytdStart = values.ytd - todaySpend
    const forecast = computeCategoryForecastAtPct(values, ytdStart, pctToday, true)
    total += forecast
  }
  return total
}

export function computeStartOfDayExpenseGap(
  todaySnapshot: SnapshotByCategory,
  localTodayStr: string,
  todaySpendByCategory: Map<string, number>
): number {
  const pctToday = pctElapsedForCalendarDate(localTodayStr)
  let total = 0
  for (const [category, values] of todaySnapshot) {
    if (!isExpenseCategory(category)) continue
    const todaySpend = todaySpendByCategory.get(category) ?? 0
    const ytdStart = values.ytd - todaySpend
    const forecast = computeCategoryForecastAtPct(values, ytdStart, pctToday, true)
    total += values.annualBudget - forecast
  }
  return total
}

export function sumExpenseBudgetFromSnapshot(snapshot: SnapshotByCategory): number {
  let total = 0
  for (const [category, values] of snapshot) {
    if (!isExpenseCategory(category)) continue
    total += values.annualBudget
  }
  return total
}

/**
 * Total expense forecast at end of tomorrow if no more spend today: tomorrow's day fraction, YTD through today.
 */
export function computeTomorrowAtZeroExpenseForecast(
  tomorrowSnapshot: SnapshotByCategory,
  localTomorrowStr: string
): number {
  const pctTomorrow = pctElapsedForCalendarDate(localTomorrowStr)
  let total = 0
  for (const [category, values] of tomorrowSnapshot) {
    if (!isExpenseCategory(category)) continue
    const forecast = computeCategoryForecastAtPct(values, values.ytd, pctTomorrow, true)
    total += forecast
  }
  return total
}

/**
 * Forecast change from start of today to tomorrow if no more spend (positive = forecast rises).
 * Uses snapshot timelines and bridge-consistent forecast sums.
 */
export function computeImpliedForecastChangeIfNoMoreSpend(
  todaySnapshot: SnapshotByCategory,
  tomorrowSnapshot: SnapshotByCategory | undefined,
  localTodayStr: string,
  todaySpendByCategory: Map<string, number>
): number | null {
  if (!tomorrowSnapshot || tomorrowSnapshot.size === 0) return null
  const localTomorrowStr = addCalendarDays(localTodayStr, 1)
  const startForecast = computeStartOfDayExpenseForecast(
    todaySnapshot,
    localTodayStr,
    todaySpendByCategory
  )
  const endForecast = computeTomorrowAtZeroExpenseForecast(
    tomorrowSnapshot,
    localTomorrowStr
  )
  if (!Number.isFinite(startForecast) || !Number.isFinite(endForecast)) return null
  return endForecast - startForecast
}

export type DailyTodayMetrics = {
  localTodayStr: string
  localYesterdayStr: string
  localTomorrowStr: string
  /** Start-of-today total expense forecast (bridge aggregation). */
  totalForecastStartOfToday: number
  /** Tomorrow at zero total expense forecast. */
  totalForecastTomorrowAtZero: number
  /** tomorrowAtZero − startOfToday; positive = forecast rises. */
  impliedForecastChangeIfNoMoreSpend: number | null
  /** Gap change yesterday → today (totalEnd − totalStart from bridge). */
  gapChangeSinceYesterday: number | null
}

export function buildTodaySpendByCategoryFromRows(
  rows: Array<{
    category: string | null
    amount_gbp: number | null
    amount_usd: number | null
  }>,
  fxRate: number,
  isExpense: (category: string) => boolean
): Map<string, number> {
  const effectiveRate = fxRate > 0 ? fxRate : 1.27
  const map = new Map<string, number>()
  for (const row of rows) {
    if (!row.category || !isExpense(row.category)) continue
    const amountGbp =
      row.amount_gbp != null
        ? Number(row.amount_gbp)
        : row.amount_usd != null
          ? Number(row.amount_usd) / effectiveRate
          : 0
    if (!Number.isFinite(amountGbp) || amountGbp === 0) continue
    map.set(row.category, (map.get(row.category) ?? 0) + amountGbp)
  }
  return map
}
