import { computeManualYearForecast } from '@/lib/forecasting'
import type {
  CategoryForecastSnapshot,
  SnapshotByCategory,
} from '@/lib/forecast-evolution'
import {
  dayOfYearFromCalendarDate,
  totalDaysInCalendarYear,
} from '@/lib/forecast-evolution'
import {
  buildForecastBridgeFromSnapshots,
  type ForecastBridgePayload,
  toLocalDateString,
} from '@/lib/daily-summary-utils'

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

/** Expense categories: projected annual spend is shown as a positive magnitude (matches today-headroom). */
function addExpenseForecastMagnitude(total: number, forecast: number): number {
  return total + Math.abs(forecast)
}

/** Sum expense forecast magnitudes for headline / Today totals (not bridge gap math). */
export function sumExpenseForecastFromSnapshot(snapshot: SnapshotByCategory): number {
  let total = 0
  for (const [category, values] of snapshot) {
    if (!isExpenseCategory(category)) continue
    total = addExpenseForecastMagnitude(total, values.forecast)
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
    total = addExpenseForecastMagnitude(total, forecast)
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

export type ExpenseGapMap = Map<string, { annualBudget: number; forecast: number; gap: number }>

/** Per-category gap map from a snapshot (expense categories only). */
export function buildExpenseGapMapFromSnapshot(snapshot: SnapshotByCategory): ExpenseGapMap {
  const map: ExpenseGapMap = new Map()
  for (const [category, values] of snapshot) {
    if (!isExpenseCategory(category)) continue
    map.set(category, {
      annualBudget: values.annualBudget,
      forecast: values.forecast,
      gap: values.gap,
    })
  }
  return map
}

/**
 * Gap map at start of a calendar day: that date's day fraction, YTD excluding that date's spend.
 */
export function buildStartOfDayExpenseGapMap(
  daySnapshot: SnapshotByCategory,
  dateStr: string,
  spendOnDateByCategory: Map<string, number>
): ExpenseGapMap {
  const pct = pctElapsedForCalendarDate(dateStr)
  const map: ExpenseGapMap = new Map()
  for (const [category, values] of daySnapshot) {
    if (!isExpenseCategory(category)) continue
    const spendOnDate = spendOnDateByCategory.get(category) ?? 0
    const ytdStart = values.ytd - spendOnDate
    const forecast = computeCategoryForecastAtPct(values, ytdStart, pct, true)
    map.set(category, {
      annualBudget: values.annualBudget,
      forecast,
      gap: values.annualBudget - forecast,
    })
  }
  return map
}

/**
 * Day-over-day gap bridge from two end-of-day snapshots (start EOD → end EOD).
 * Matches the Forecast Evolution bridge (/api/forecast-bridge) and forecast-gap-over-time
 * day-over-day gap (budget − forecast per category).
 */
export function buildForecastBridgeSinceYesterday(
  startSnapshot: SnapshotByCategory,
  endSnapshot: SnapshotByCategory,
  startDateStr: string,
  endDateStr: string
): ForecastBridgePayload {
  const startGapMap = buildExpenseGapMapFromSnapshot(startSnapshot)
  const endGapMap = buildExpenseGapMapFromSnapshot(endSnapshot)
  return buildForecastBridgeFromSnapshots(
    startDateStr,
    endDateStr,
    startGapMap,
    endGapMap
  )
}

export function buildSpendByCategoryForDate(
  rows: Array<{
    category: string | null
    date: string
    amount_gbp: number | null
    amount_usd: number | null
  }>,
  dateStr: string,
  fxRate: number,
  isExpense: (category: string) => boolean
): Map<string, number> {
  const filtered = rows.filter((row) => {
    const d = typeof row.date === 'string' ? row.date.split('T')[0] : ''
    return d === dateStr
  })
  return buildTodaySpendByCategoryFromRows(filtered, fxRate, isExpense)
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
 * Total expense forecast at end of tomorrow if no more spend today: tomorrow's day fraction, YTD through today (locked).
 */
export function computeTomorrowAtZeroExpenseForecast(
  todaySnapshot: SnapshotByCategory,
  localTomorrowStr: string
): number {
  const pctTomorrow = pctElapsedForCalendarDate(localTomorrowStr)
  let total = 0
  for (const [category, values] of todaySnapshot) {
    if (!isExpenseCategory(category)) continue
    const forecast = computeCategoryForecastAtPct(values, values.ytd, pctTomorrow, true)
    total = addExpenseForecastMagnitude(total, forecast)
  }
  return total
}

/**
 * Forecast change from start of today to tomorrow if no more spend (positive = forecast rises).
 * Start = this morning (YTD excludes today); end = tomorrow with today's spend locked in.
 * Uses snapshot timelines and magnitude totals (matches computeTodayHeadroom).
 */
export function computeImpliedForecastChangeIfNoMoreSpend(
  todaySnapshot: SnapshotByCategory,
  localTodayStr: string,
  todaySpendByCategory: Map<string, number>
): number | null {
  if (todaySnapshot.size === 0) return null
  const localTomorrowStr = addCalendarDays(localTodayStr, 1)
  const startForecast = computeStartOfDayExpenseForecast(
    todaySnapshot,
    localTodayStr,
    todaySpendByCategory
  )
  const endForecast = computeTomorrowAtZeroExpenseForecast(todaySnapshot, localTomorrowStr)
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
  /** Gap change from end of yesterday to end of today (matches forecast evolution chart). */
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
