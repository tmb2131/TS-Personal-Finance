/**
 * Transaction-based forecasting.
 *
 * Forecasts the current year's expense spend per category using ONLY the data in
 * `transaction_log`. Three independent methodologies are computed and surfaced as a
 * low / base / high range (min / median / max across the three).
 *
 * All amounts are returned in GBP. Caller converts at display time.
 *
 * Methodologies:
 *   M1 — Seasonal Average: trailing-3y mean per (category, calendar month).
 *   M2 — Seasonal + Trend: M1 seasonal index × trend-projected annual total.
 *   M3 — Fixed/Variable: detect recurring fixed spend, project variable separately.
 *
 * The current year's months 1..currentMonth are always actuals (YTD), regardless of method.
 */

export const EXCLUDED_FROM_FORECAST = new Set([
  'Excluded',
  'Income',
  'Other Income',
  'Gift Money',
])

export const TRAINING_YEARS = 3

export type ForecastTxRow = {
  date: string // YYYY-MM-DD
  category: string
  counterparty: string | null
  amount_gbp: number | null
  amount_usd: number | null
}

export type MethodologyId = 'm1' | 'm2' | 'm3'

export type CategoryMonthlyForecast = {
  category: string
  /** Length 12. Past months: actuals. Current month: MTD + remaining-days projection.
   *  Future months: full-month forecast. GBP positive expenses. */
  months: number[]
  /** Length 12. 'actual' = past completed month; 'partial' = current month (MTD + projection);
   *  'forecast' = future month. */
  monthType: ('actual' | 'partial' | 'forecast')[]
  /** Length 12. true if any portion of the month is actual data (past completed or current MTD). */
  isActual: boolean[]
  /** Sum of months[]. */
  fullYear: number
  /** YTD actuals only — through end of last completed month. Excludes current-month MTD. */
  ytd: number
}

export type MethodologyResult = {
  id: MethodologyId
  label: string
  description: string
  byCategory: CategoryMonthlyForecast[]
  /** Sum of fullYear across all categories. */
  fullYearTotal: number
  /** Sum of YTD across all categories. */
  ytdTotal: number
}

export type EnsembleCategory = {
  category: string
  ytd: number
  /** Length 12. Past months: actuals. Current month: MTD + median of methodologies'
   *  remaining-days projections. Future months: median across methodologies. */
  monthsBase: number[]
  monthsLow: number[]
  monthsHigh: number[]
  /** Length 12. 'actual' | 'partial' | 'forecast'. */
  monthType: ('actual' | 'partial' | 'forecast')[]
  /** Length 12. true if any portion of the month is actual data. */
  isActual: boolean[]
  /** Per-methodology full-year totals for this category. */
  byMethodology: { m1: number; m2: number; m3: number }
  /** Min / median / max across methodologies for full year. */
  fullYearLow: number
  fullYearBase: number
  fullYearHigh: number
  /** Prior calendar year actuals total for this category (for vs-PY %). 0 if no data. */
  priorYearActual: number
}

export type ForecastEnsemble = {
  year: number
  currentMonth: number // 1-12; YTD includes months 1..currentMonth - 1 fully, plus partial currentMonth
  categories: EnsembleCategory[]
  /** Aggregate (sum across categories) totals. */
  totals: {
    ytd: number
    monthsBase: number[]
    monthsLow: number[]
    monthsHigh: number[]
    monthType: ('actual' | 'partial' | 'forecast')[]
    isActual: boolean[]
    fullYearLow: number
    fullYearBase: number
    fullYearHigh: number
    priorYearActual: number
    byMethodology: { m1: number; m2: number; m3: number }
  }
  /** Day-of-month progress for the current month (0..1). 1 = month complete. */
  currentMonthProgress: number
}

export type BacktestCategoryEntry = {
  category: string
  actual: number
  m1: number
  m2: number
  m3: number
  /** Mean Absolute Percent Error per methodology, capped at 1000%. */
  m1Mape: number
  m2Mape: number
  m3Mape: number
}

export type BacktestResult = {
  /** Year that was forecast (most recent completed year). */
  year: number
  categories: BacktestCategoryEntry[]
  totals: {
    actual: number
    m1: number
    m2: number
    m3: number
    m1Mape: number
    m2Mape: number
    m3Mape: number
  }
  /** Lowest-overall-MAPE methodology id. */
  bestOverall: MethodologyId
}

export type BestFitCategoryPick = {
  category: string
  picked: MethodologyId
  /** MAPE that drove the pick. null if fallback used (no backtest entry for this category). */
  mape: number | null
  fallback: boolean
}

export type BestFitResult = {
  /** Per-category forecast pulled from the picked methodology. */
  byCategory: CategoryMonthlyForecast[]
  /** Why each pick was made — same length & order as byCategory. */
  picks: BestFitCategoryPick[]
  /** Sum of months across all categories (length 12). */
  monthsTotal: number[]
  monthType: ('actual' | 'partial' | 'forecast')[]
  fullYearTotal: number
  ytdTotal: number
  pickCounts: { m1: number; m2: number; m3: number; fallback: number }
}

export type TransactionForecastResult = {
  /** As-of date (typically today). */
  asOf: string
  year: number
  currentMonth: number
  ensemble: ForecastEnsemble
  methodologies: MethodologyResult[]
  bestFit: BestFitResult | null
  backtest: BacktestResult | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const normalizeAmountGBP = (
  amountGBP: number | null,
  amountUSD: number | null,
  gbpUsdRate: number,
): number => {
  if (amountGBP != null && !Number.isNaN(Number(amountGBP))) return Number(amountGBP)
  if (amountUSD != null && !Number.isNaN(Number(amountUSD))) return Number(amountUSD) / gbpUsdRate
  return 0
}

const toDateOnly = (value: string): string => value.split('T')[0]

const median = (values: number[]): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

const round = (n: number) => Math.round(n * 100) / 100

const safeDiv = (num: number, den: number, fallback = 0): number => {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return fallback
  return num / den
}

const monthIndex = (dateStr: string): { year: number; month: number } => {
  const d = toDateOnly(dateStr)
  const [y, m] = d.split('-').map(Number)
  return { year: y, month: m } // month 1-12
}

/** Normalize counterparty for fingerprinting: lowercase, trim, strip non-alphanum. */
const fingerprintCounterparty = (raw: string | null | undefined): string => {
  if (!raw) return ''
  return String(raw)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// Monthly grid construction
// ---------------------------------------------------------------------------

/**
 * Per-category, per-(year-month) total of expense spend in GBP, expressed as POSITIVE values.
 * Only includes categories not in EXCLUDED_FROM_FORECAST.
 *
 * Shape: { [category]: { [`YYYY-MM`]: amountGBP } }
 */
export type MonthlyGrid = Record<string, Record<string, number>>

/** Internal: per-category list of transactions for recurring detection. */
type CategoryTxIndex = Record<string, ForecastTxRow[]>

export function buildMonthlyGrid(
  rows: ForecastTxRow[],
  gbpUsdRate: number,
): { grid: MonthlyGrid; txByCategory: CategoryTxIndex } {
  const grid: MonthlyGrid = {}
  const txByCategory: CategoryTxIndex = {}
  for (const row of rows) {
    if (!row.category) continue
    if (EXCLUDED_FROM_FORECAST.has(row.category)) continue
    const amount = normalizeAmountGBP(row.amount_gbp, row.amount_usd, gbpUsdRate)
    if (amount === 0) continue
    // Expenses: only count negative-sign entries for an expense category (treat as positive spend).
    if (amount > 0) continue // income/refunds in expense category — ignore for forecast
    const date = toDateOnly(row.date)
    if (!date) continue
    const ym = date.slice(0, 7)
    grid[row.category] ??= {}
    grid[row.category][ym] = (grid[row.category][ym] ?? 0) + Math.abs(amount)
    txByCategory[row.category] ??= []
    txByCategory[row.category].push({ ...row, date })
  }
  return { grid, txByCategory }
}

const ymKey = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, '0')}`

// ---------------------------------------------------------------------------
// M1 — Seasonal Average (trailing-3y calendar-month mean)
// ---------------------------------------------------------------------------

function computeSeasonalMeans(
  grid: MonthlyGrid,
  category: string,
  trainingYears: number[],
): { means: number[]; observedYears: number } {
  // Returns length-12 array; index 0 = January.
  // For training years where the category had ANY activity, missing months count as £0
  // (legitimate zero — the user didn't spend in that month). Years with no activity at
  // all are treated as missing to avoid penalizing newly-tracked categories.
  const means = new Array(12).fill(0)
  const counts = new Array(12).fill(0)
  let observedYears = 0
  for (const y of trainingYears) {
    let yearHasData = false
    for (let m = 1; m <= 12; m++) {
      if (grid[category]?.[ymKey(y, m)] != null) {
        yearHasData = true
        break
      }
    }
    if (!yearHasData) continue
    observedYears += 1
    for (let m = 1; m <= 12; m++) {
      means[m - 1] += grid[category]?.[ymKey(y, m)] ?? 0
      counts[m - 1] += 1
    }
  }
  return {
    means: means.map((sum, i) => (counts[i] > 0 ? sum / counts[i] : 0)),
    observedYears,
  }
}

function trailing12Mean(
  grid: MonthlyGrid,
  category: string,
  asOfYear: number,
  asOfMonth: number,
): number {
  let sum = 0
  let n = 0
  let y = asOfYear
  let m = asOfMonth - 1 // start with previous full month
  for (let i = 0; i < 12; i++) {
    if (m <= 0) {
      m = 12
      y -= 1
    }
    const v = grid[category]?.[ymKey(y, m)]
    if (v != null) {
      sum += v
      n += 1
    }
    m -= 1
  }
  return n > 0 ? sum / n : 0
}

function methodologyM1(
  grid: MonthlyGrid,
  year: number,
  currentMonth: number,
  monthProgress: number,
  ytdByCategory: Record<string, number[]>,
): MethodologyResult {
  const trainingYears = [year - 3, year - 2, year - 1]
  const categories = Object.keys(grid).sort((a, b) => a.localeCompare(b))
  const byCategory: CategoryMonthlyForecast[] = categories.map((category) => {
    const { means: seasonal, observedYears } = computeSeasonalMeans(grid, category, trainingYears)
    const fallback = trailing12Mean(grid, category, year, currentMonth)
    const monthlyEstimate = (idx: number) => (observedYears > 0 ? seasonal[idx] : fallback)

    const months = new Array(12).fill(0)
    const monthType: ('actual' | 'partial' | 'forecast')[] = new Array(12).fill('forecast')
    for (let m = 1; m <= 12; m++) {
      const idx = m - 1
      if (m < currentMonth) {
        months[idx] = ytdByCategory[category]?.[idx] ?? 0
        monthType[idx] = 'actual'
      } else if (m === currentMonth) {
        const mtd = ytdByCategory[category]?.[idx] ?? 0
        const remainder = (1 - monthProgress) * monthlyEstimate(idx)
        months[idx] = mtd + remainder
        monthType[idx] = 'partial'
      } else {
        months[idx] = monthlyEstimate(idx)
        monthType[idx] = 'forecast'
      }
    }
    const fullYear = months.reduce((s, v) => s + v, 0)
    const ytd = months
      .slice(0, Math.max(0, currentMonth - 1))
      .reduce((s, v) => s + v, 0)
    return {
      category,
      months,
      monthType,
      isActual: monthType.map((t) => t !== 'forecast'),
      fullYear: round(fullYear),
      ytd: round(ytd),
    }
  })
  const fullYearTotal = byCategory.reduce((s, c) => s + c.fullYear, 0)
  const ytdTotal = byCategory.reduce((s, c) => s + c.ytd, 0)
  return {
    id: 'm1',
    label: 'Seasonal Average',
    description: 'Trailing 3-year average for each calendar month.',
    byCategory,
    fullYearTotal: round(fullYearTotal),
    ytdTotal: round(ytdTotal),
  }
}

// ---------------------------------------------------------------------------
// M2 — Seasonal + Trend
// ---------------------------------------------------------------------------

const TREND_CLAMP = 0.3 // ±30% YoY growth clamp

function computeAnnualTotal(
  grid: MonthlyGrid,
  category: string,
  year: number,
): number {
  let sum = 0
  for (let m = 1; m <= 12; m++) {
    sum += grid[category]?.[ymKey(year, m)] ?? 0
  }
  return sum
}

function computeYoYGrowth(grid: MonthlyGrid, category: string, year: number): number {
  // Geometric mean of YoY ratios across the trailing 3 windows: (y-1/y-2), (y-2/y-3).
  // If trailing data is sparse, return 0.
  const ratios: number[] = []
  for (let i = 1; i < TRAINING_YEARS; i++) {
    const recent = computeAnnualTotal(grid, category, year - i)
    const older = computeAnnualTotal(grid, category, year - i - 1)
    if (older > 0 && recent > 0) ratios.push(recent / older)
  }
  if (ratios.length === 0) return 0
  const log = ratios.reduce((s, r) => s + Math.log(r), 0) / ratios.length
  const g = Math.exp(log) - 1 // growth rate
  return Math.max(-TREND_CLAMP, Math.min(TREND_CLAMP, g))
}

function methodologyM2(
  grid: MonthlyGrid,
  year: number,
  currentMonth: number,
  monthProgress: number,
  ytdByCategory: Record<string, number[]>,
): MethodologyResult {
  const trainingYears = [year - 3, year - 2, year - 1]
  const categories = Object.keys(grid).sort((a, b) => a.localeCompare(b))

  const byCategory: CategoryMonthlyForecast[] = categories.map((category) => {
    const { means: seasonal, observedYears } = computeSeasonalMeans(grid, category, trainingYears)
    const seasonalSum = seasonal.reduce((s, v) => s + v, 0)
    // Seasonal index normalized to mean=1 across observed months
    const seasonalIndex =
      seasonalSum > 0 ? seasonal.map((v) => safeDiv(v * 12, seasonalSum, 1)) : new Array(12).fill(1)

    const priorYearTotal = computeAnnualTotal(grid, category, year - 1)
    const growth = computeYoYGrowth(grid, category, year)
    const projectedAnnual =
      priorYearTotal > 0 ? priorYearTotal * (1 + growth) : seasonalSum // fallback to M1's annual

    const monthlyProjected = seasonalIndex.map((idx) => (projectedAnnual / 12) * idx)

    const fallback = trailing12Mean(grid, category, year, currentMonth)
    const monthlyEstimate = (idx: number) =>
      observedYears > 0 ? monthlyProjected[idx] : fallback

    const months = new Array(12).fill(0)
    const monthType: ('actual' | 'partial' | 'forecast')[] = new Array(12).fill('forecast')
    for (let m = 1; m <= 12; m++) {
      const idx = m - 1
      if (m < currentMonth) {
        months[idx] = ytdByCategory[category]?.[idx] ?? 0
        monthType[idx] = 'actual'
      } else if (m === currentMonth) {
        const mtd = ytdByCategory[category]?.[idx] ?? 0
        const remainder = (1 - monthProgress) * monthlyEstimate(idx)
        months[idx] = mtd + remainder
        monthType[idx] = 'partial'
      } else {
        months[idx] = monthlyEstimate(idx)
        monthType[idx] = 'forecast'
      }
    }
    const fullYear = months.reduce((s, v) => s + v, 0)
    const ytd = months
      .slice(0, Math.max(0, currentMonth - 1))
      .reduce((s, v) => s + v, 0)
    return {
      category,
      months,
      monthType,
      isActual: monthType.map((t) => t !== 'forecast'),
      fullYear: round(fullYear),
      ytd: round(ytd),
    }
  })
  const fullYearTotal = byCategory.reduce((s, c) => s + c.fullYear, 0)
  const ytdTotal = byCategory.reduce((s, c) => s + c.ytd, 0)
  return {
    id: 'm2',
    label: 'Seasonal + Trend',
    description:
      'Seasonal pattern from trailing 3 years scaled by per-category YoY growth (clamped ±30%).',
    byCategory,
    fullYearTotal: round(fullYearTotal),
    ytdTotal: round(ytdTotal),
  }
}

// ---------------------------------------------------------------------------
// M3 — Fixed/Variable Decomposition
// ---------------------------------------------------------------------------

type RecurringCluster = {
  fingerprint: string
  category: string
  /** Mean monthly amount (GBP positive). */
  monthlyAmount: number
  /** Months in trailing 12 it fired in. */
  monthsActive: number
  /** Most recent month it appeared in (YYYY-MM). */
  lastMonth: string
}

function detectRecurring(
  txByCategory: CategoryTxIndex,
  gbpUsdRate: number,
  asOfYear: number,
  asOfMonth: number,
): Record<string, RecurringCluster[]> {
  const result: Record<string, RecurringCluster[]> = {}
  // Trailing 12-month cutoff
  let startY = asOfYear
  let startM = asOfMonth - 11
  while (startM <= 0) {
    startM += 12
    startY -= 1
  }
  const startKey = ymKey(startY, startM)

  for (const [category, txs] of Object.entries(txByCategory)) {
    // Group by counterparty fingerprint; gate clusters on amount stability (CV).
    const byFingerprint = new Map<
      string,
      { amounts: number[]; months: Set<string>; monthAmount: Map<string, number>; lastMonth: string }
    >()
    for (const tx of txs) {
      const ym = tx.date.slice(0, 7)
      if (ym < startKey) continue
      const amt = Math.abs(normalizeAmountGBP(tx.amount_gbp, tx.amount_usd, gbpUsdRate))
      if (amt === 0) continue
      const cp = fingerprintCounterparty(tx.counterparty)
      if (!cp) continue
      const entry = byFingerprint.get(cp) ?? {
        amounts: [],
        months: new Set<string>(),
        monthAmount: new Map<string, number>(),
        lastMonth: '',
      }
      entry.amounts.push(amt)
      entry.months.add(ym)
      entry.monthAmount.set(ym, (entry.monthAmount.get(ym) ?? 0) + amt)
      if (ym > entry.lastMonth) entry.lastMonth = ym
      byFingerprint.set(cp, entry)
    }
    const clusters: RecurringCluster[] = []
    for (const [cp, entry] of byFingerprint.entries()) {
      if (entry.months.size < 9) continue // require 9 of last 12 months
      // Gate on month-to-month amount stability: coefficient of variation ≤ 0.15.
      const monthly = Array.from(entry.monthAmount.values())
      const mean = monthly.reduce((s, v) => s + v, 0) / monthly.length
      if (mean <= 0) continue
      const variance =
        monthly.reduce((s, v) => s + (v - mean) ** 2, 0) / monthly.length
      const cv = Math.sqrt(variance) / mean
      if (cv > 0.15) continue
      clusters.push({
        fingerprint: cp,
        category,
        monthlyAmount: mean,
        monthsActive: entry.months.size,
        lastMonth: entry.lastMonth,
      })
    }
    if (clusters.length > 0) result[category] = clusters
  }
  return result
}

function methodologyM3(
  grid: MonthlyGrid,
  txByCategory: CategoryTxIndex,
  year: number,
  currentMonth: number,
  monthProgress: number,
  ytdByCategory: Record<string, number[]>,
  gbpUsdRate: number,
): MethodologyResult {
  const recurringByCategory = detectRecurring(txByCategory, gbpUsdRate, year, currentMonth)
  const trainingYears = [year - 3, year - 2, year - 1]

  const categories = Object.keys(grid).sort((a, b) => a.localeCompare(b))
  const byCategory: CategoryMonthlyForecast[] = categories.map((category) => {
    const fixedMonthly = (recurringByCategory[category] ?? []).reduce(
      (s, c) => s + c.monthlyAmount,
      0,
    )
    // Compute trailing-12m total for this category and back out fixed.
    const trailing12Total = (() => {
      let sum = 0
      let y = year
      let m = currentMonth - 1
      for (let i = 0; i < 12; i++) {
        if (m <= 0) {
          m = 12
          y -= 1
        }
        sum += grid[category]?.[ymKey(y, m)] ?? 0
        m -= 1
      }
      return sum
    })()
    const fixedTrailing = fixedMonthly * 12
    const variableTrailing = Math.max(0, trailing12Total - fixedTrailing)
    const variableMean = variableTrailing / 12

    // Use M1's seasonal pattern (normalized to mean=1) to allocate variable across months.
    const { means: seasonal } = computeSeasonalMeans(grid, category, trainingYears)
    const seasonalSum = seasonal.reduce((s, v) => s + v, 0)
    const seasonalIndex =
      seasonalSum > 0 ? seasonal.map((v) => safeDiv(v * 12, seasonalSum, 1)) : new Array(12).fill(1)

    const monthlyEstimate = (idx: number) => fixedMonthly + variableMean * seasonalIndex[idx]

    const months = new Array(12).fill(0)
    const monthType: ('actual' | 'partial' | 'forecast')[] = new Array(12).fill('forecast')
    for (let m = 1; m <= 12; m++) {
      const idx = m - 1
      if (m < currentMonth) {
        months[idx] = ytdByCategory[category]?.[idx] ?? 0
        monthType[idx] = 'actual'
      } else if (m === currentMonth) {
        const mtd = ytdByCategory[category]?.[idx] ?? 0
        const remainder = (1 - monthProgress) * monthlyEstimate(idx)
        months[idx] = mtd + remainder
        monthType[idx] = 'partial'
      } else {
        months[idx] = monthlyEstimate(idx)
        monthType[idx] = 'forecast'
      }
    }
    const fullYear = months.reduce((s, v) => s + v, 0)
    const ytd = months
      .slice(0, Math.max(0, currentMonth - 1))
      .reduce((s, v) => s + v, 0)
    return {
      category,
      months,
      monthType,
      isActual: monthType.map((t) => t !== 'forecast'),
      fullYear: round(fullYear),
      ytd: round(ytd),
    }
  })
  const fullYearTotal = byCategory.reduce((s, c) => s + c.fullYear, 0)
  const ytdTotal = byCategory.reduce((s, c) => s + c.ytd, 0)
  return {
    id: 'm3',
    label: 'Fixed + Variable',
    description:
      'Detects recurring fixed spend (counterparty + amount, ≥9 of last 12 months) and projects only the variable portion seasonally.',
    byCategory,
    fullYearTotal: round(fullYearTotal),
    ytdTotal: round(ytdTotal),
  }
}

// ---------------------------------------------------------------------------
// YTD by category (per month)
// ---------------------------------------------------------------------------

function buildYtdByCategory(
  grid: MonthlyGrid,
  year: number,
  currentMonth: number,
): Record<string, number[]> {
  const out: Record<string, number[]> = {}
  for (const category of Object.keys(grid)) {
    const arr = new Array(12).fill(0)
    for (let m = 1; m <= currentMonth; m++) {
      arr[m - 1] = grid[category]?.[ymKey(year, m)] ?? 0
    }
    out[category] = arr
  }
  return out
}

// ---------------------------------------------------------------------------
// Ensemble
// ---------------------------------------------------------------------------

function buildEnsemble(
  methodologies: MethodologyResult[],
  grid: MonthlyGrid,
  year: number,
  currentMonth: number,
  monthProgress: number,
): ForecastEnsemble {
  // Union of categories across methodologies.
  const categorySet = new Set<string>()
  methodologies.forEach((m) => m.byCategory.forEach((c) => categorySet.add(c.category)))
  const categories = Array.from(categorySet).sort((a, b) => a.localeCompare(b))

  const findCategory = (m: MethodologyResult, cat: string) =>
    m.byCategory.find((c) => c.category === cat)

  const categoriesOut: EnsembleCategory[] = categories.map((category) => {
    const m1 = findCategory(methodologies.find((m) => m.id === 'm1')!, category)
    const m2 = findCategory(methodologies.find((m) => m.id === 'm2')!, category)
    const m3 = findCategory(methodologies.find((m) => m.id === 'm3')!, category)

    const monthsBase = new Array(12).fill(0)
    const monthsLow = new Array(12).fill(0)
    const monthsHigh = new Array(12).fill(0)
    const monthType: ('actual' | 'partial' | 'forecast')[] = new Array(12).fill('forecast')

    for (let i = 0; i < 12; i++) {
      const vs = [m1?.months[i] ?? 0, m2?.months[i] ?? 0, m3?.months[i] ?? 0]
      const t = m1?.monthType[i] ?? 'forecast'
      monthType[i] = t
      if (t === 'actual') {
        monthsBase[i] = vs[0]
        monthsLow[i] = vs[0]
        monthsHigh[i] = vs[0]
      } else {
        // 'partial' and 'forecast' both have methodology spread.
        monthsBase[i] = median(vs)
        monthsLow[i] = Math.min(...vs)
        monthsHigh[i] = Math.max(...vs)
      }
    }

    const fyVs = [m1?.fullYear ?? 0, m2?.fullYear ?? 0, m3?.fullYear ?? 0]
    const ytd = m1?.ytd ?? 0
    const priorYearActual = computeAnnualTotal(grid, category, year - 1)

    return {
      category,
      ytd: round(ytd),
      monthsBase: monthsBase.map(round),
      monthsLow: monthsLow.map(round),
      monthsHigh: monthsHigh.map(round),
      monthType,
      isActual: monthType.map((t) => t !== 'forecast'),
      byMethodology: { m1: m1?.fullYear ?? 0, m2: m2?.fullYear ?? 0, m3: m3?.fullYear ?? 0 },
      fullYearLow: round(Math.min(...fyVs)),
      fullYearBase: round(median(fyVs)),
      fullYearHigh: round(Math.max(...fyVs)),
      priorYearActual: round(priorYearActual),
    }
  })

  // Aggregate totals — sum *per-month* and sum of full-year low/base/high.
  const totalsMonthsBase = new Array(12).fill(0)
  const totalsMonthsLow = new Array(12).fill(0)
  const totalsMonthsHigh = new Array(12).fill(0)
  const totalsMonthType: ('actual' | 'partial' | 'forecast')[] = new Array(12).fill('forecast')
  let totalYtd = 0
  let totalFyBase = 0
  let totalFyLow = 0
  let totalFyHigh = 0
  let totalPyActual = 0
  let totalM1 = 0
  let totalM2 = 0
  let totalM3 = 0

  for (const c of categoriesOut) {
    for (let i = 0; i < 12; i++) {
      totalsMonthsBase[i] += c.monthsBase[i]
      totalsMonthsLow[i] += c.monthsLow[i]
      totalsMonthsHigh[i] += c.monthsHigh[i]
      totalsMonthType[i] = c.monthType[i]
    }
    totalYtd += c.ytd
    totalFyBase += c.fullYearBase
    totalFyLow += c.fullYearLow
    totalFyHigh += c.fullYearHigh
    totalPyActual += c.priorYearActual
    totalM1 += c.byMethodology.m1
    totalM2 += c.byMethodology.m2
    totalM3 += c.byMethodology.m3
  }

  return {
    year,
    currentMonth,
    currentMonthProgress: monthProgress,
    categories: categoriesOut,
    totals: {
      ytd: round(totalYtd),
      monthsBase: totalsMonthsBase.map(round),
      monthsLow: totalsMonthsLow.map(round),
      monthsHigh: totalsMonthsHigh.map(round),
      monthType: totalsMonthType,
      isActual: totalsMonthType.map((t) => t !== 'forecast'),
      fullYearLow: round(totalFyLow),
      fullYearBase: round(totalFyBase),
      fullYearHigh: round(totalFyHigh),
      priorYearActual: round(totalPyActual),
      byMethodology: { m1: round(totalM1), m2: round(totalM2), m3: round(totalM3) },
    },
  }
}

// ---------------------------------------------------------------------------
// Best Fit
// ---------------------------------------------------------------------------

/**
 * For each category, pick the methodology with the lowest backtest MAPE and use its
 * current-year forecast for that category. Sum across categories for portfolio totals.
 *
 * Categories without a backtest entry (new spend areas, or zero prior-year actuals) fall
 * back to the methodology with the lowest overall portfolio MAPE (`backtest.bestOverall`).
 *
 * MAPE ties resolve in order: m1 → m2 → m3.
 */
function buildBestFit(
  methodologies: MethodologyResult[],
  backtest: BacktestResult,
): BestFitResult {
  const m1 = methodologies.find((m) => m.id === 'm1')!
  const m2 = methodologies.find((m) => m.id === 'm2')!
  const m3 = methodologies.find((m) => m.id === 'm3')!
  const byId: Record<MethodologyId, MethodologyResult> = { m1, m2, m3 }

  const categorySet = new Set<string>()
  methodologies.forEach((m) => m.byCategory.forEach((c) => categorySet.add(c.category)))
  const categories = Array.from(categorySet).sort((a, b) => a.localeCompare(b))

  const pickByMape = (
    e1: number,
    e2: number,
    e3: number,
  ): MethodologyId => {
    let best: MethodologyId = 'm1'
    let bestErr = e1
    if (e2 < bestErr) {
      best = 'm2'
      bestErr = e2
    }
    if (e3 < bestErr) {
      best = 'm3'
    }
    return best
  }

  const byCategory: CategoryMonthlyForecast[] = []
  const picks: BestFitCategoryPick[] = []
  const pickCounts = { m1: 0, m2: 0, m3: 0, fallback: 0 }

  for (const category of categories) {
    const bt = backtest.categories.find((c) => c.category === category)
    let picked: MethodologyId
    let mape: number | null
    let fallback: boolean
    if (bt) {
      picked = pickByMape(bt.m1Mape, bt.m2Mape, bt.m3Mape)
      mape = picked === 'm1' ? bt.m1Mape : picked === 'm2' ? bt.m2Mape : bt.m3Mape
      fallback = false
    } else {
      picked = backtest.bestOverall
      mape = null
      fallback = true
      pickCounts.fallback += 1
    }
    pickCounts[picked] += 1

    const cat = byId[picked].byCategory.find((c) => c.category === category)
    if (!cat) continue
    byCategory.push(cat)
    picks.push({ category, picked, mape, fallback })
  }

  const monthsTotal = new Array(12).fill(0)
  const monthType: ('actual' | 'partial' | 'forecast')[] = new Array(12).fill('forecast')
  let fullYearTotal = 0
  let ytdTotal = 0
  for (const cat of byCategory) {
    for (let i = 0; i < 12; i++) {
      monthsTotal[i] += cat.months[i]
      monthType[i] = cat.monthType[i]
    }
    fullYearTotal += cat.fullYear
    ytdTotal += cat.ytd
  }

  return {
    byCategory,
    picks,
    monthsTotal: monthsTotal.map(round),
    monthType,
    fullYearTotal: round(fullYearTotal),
    ytdTotal: round(ytdTotal),
    pickCounts,
  }
}

// ---------------------------------------------------------------------------
// Backtest
// ---------------------------------------------------------------------------

/**
 * Backtest re-runs each methodology as if it were 1 January of the most recent completed year,
 * using ONLY data strictly before that year. Compares full-year forecast to actual full-year spend.
 */
function runBacktest(
  rows: ForecastTxRow[],
  gbpUsdRate: number,
  currentYear: number,
): BacktestResult | null {
  const backtestYear = currentYear - 1
  // Keep only rows strictly before the backtest year for training.
  const trainingRows = rows.filter((r) => toDateOnly(r.date) < `${backtestYear}-01-01`)
  // Need at least 1 prior year of training data.
  const earliestTraining = trainingRows.reduce(
    (min, r) => (toDateOnly(r.date) < min ? toDateOnly(r.date) : min),
    '9999-12-31',
  )
  if (earliestTraining > `${backtestYear - 1}-12-01`) return null

  const { grid: trainingGrid } = buildMonthlyGrid(trainingRows, gbpUsdRate)
  const trainingTxByCategory: CategoryTxIndex = {}
  for (const row of trainingRows) {
    if (!row.category || EXCLUDED_FROM_FORECAST.has(row.category)) continue
    const amt = normalizeAmountGBP(row.amount_gbp, row.amount_usd, gbpUsdRate)
    if (amt >= 0) continue
    trainingTxByCategory[row.category] ??= []
    trainingTxByCategory[row.category].push({ ...row, date: toDateOnly(row.date) })
  }

  // Run each methodology with currentMonth = 0 (no YTD), forecasting all 12 months of backtestYear.
  const ytdByCategory: Record<string, number[]> = {}
  for (const cat of Object.keys(trainingGrid)) {
    ytdByCategory[cat] = new Array(12).fill(0)
  }
  // currentMonth=0 means no month is current — every month is a clean forecast.
  const m1 = methodologyM1(trainingGrid, backtestYear, 0, 1, ytdByCategory)
  const m2 = methodologyM2(trainingGrid, backtestYear, 0, 1, ytdByCategory)
  const m3 = methodologyM3(trainingGrid, trainingTxByCategory, backtestYear, 0, 1, ytdByCategory, gbpUsdRate)

  // Actuals for backtestYear come from rows IN that year.
  const actualRows = rows.filter((r) => {
    const d = toDateOnly(r.date)
    return d >= `${backtestYear}-01-01` && d < `${backtestYear + 1}-01-01`
  })
  const { grid: actualGrid } = buildMonthlyGrid(actualRows, gbpUsdRate)
  const actualByCategory: Record<string, number> = {}
  for (const cat of Object.keys(actualGrid)) {
    actualByCategory[cat] = computeAnnualTotal(actualGrid, cat, backtestYear)
  }

  const allCats = new Set<string>([
    ...Object.keys(actualByCategory),
    ...m1.byCategory.map((c) => c.category),
  ])

  const cap = (x: number) => Math.min(10, Math.max(0, x)) // cap MAPE entries at 1000%

  const categories: BacktestCategoryEntry[] = Array.from(allCats)
    .sort((a, b) => a.localeCompare(b))
    .map((category) => {
      const actual = actualByCategory[category] ?? 0
      const v1 = m1.byCategory.find((c) => c.category === category)?.fullYear ?? 0
      const v2 = m2.byCategory.find((c) => c.category === category)?.fullYear ?? 0
      const v3 = m3.byCategory.find((c) => c.category === category)?.fullYear ?? 0
      const mape = (forecast: number) =>
        actual === 0 ? (forecast === 0 ? 0 : 1) : cap(Math.abs(forecast - actual) / actual)
      return {
        category,
        actual: round(actual),
        m1: round(v1),
        m2: round(v2),
        m3: round(v3),
        m1Mape: mape(v1),
        m2Mape: mape(v2),
        m3Mape: mape(v3),
      }
    })
    .filter((c) => c.actual > 0 || c.m1 + c.m2 + c.m3 > 0)

  const totals = {
    actual: round(categories.reduce((s, c) => s + c.actual, 0)),
    m1: round(categories.reduce((s, c) => s + c.m1, 0)),
    m2: round(categories.reduce((s, c) => s + c.m2, 0)),
    m3: round(categories.reduce((s, c) => s + c.m3, 0)),
    m1Mape: 0,
    m2Mape: 0,
    m3Mape: 0,
  }
  // Weighted MAPE = sum(|forecast-actual|) / sum(actual)
  const sumAbsErr = (key: 'm1' | 'm2' | 'm3') =>
    categories.reduce((s, c) => s + Math.abs(c[key] - c.actual), 0)
  totals.m1Mape = totals.actual > 0 ? sumAbsErr('m1') / totals.actual : 0
  totals.m2Mape = totals.actual > 0 ? sumAbsErr('m2') / totals.actual : 0
  totals.m3Mape = totals.actual > 0 ? sumAbsErr('m3') / totals.actual : 0

  let bestOverall: MethodologyId = 'm1'
  if (totals.m2Mape < totals.m1Mape && totals.m2Mape <= totals.m3Mape) bestOverall = 'm2'
  else if (totals.m3Mape < totals.m1Mape && totals.m3Mape < totals.m2Mape) bestOverall = 'm3'

  return { year: backtestYear, categories, totals, bestOverall }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/** Fraction of the current month elapsed by `asOf`, in (0, 1]. End of month → 1. */
function computeMonthProgress(asOf: Date): number {
  const year = asOf.getFullYear()
  const month = asOf.getMonth() // 0-indexed
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // Day-of-month is 1-indexed; treat the current calendar day as inclusive (so day 1 of a 30-day
  // month gives 1/30 ≈ 0.033, day 30 gives 1.0).
  const day = asOf.getDate()
  return Math.max(0, Math.min(1, day / daysInMonth))
}

export function computeTransactionForecast(
  rows: ForecastTxRow[],
  gbpUsdRate: number,
  asOf: Date,
): TransactionForecastResult {
  const year = asOf.getFullYear()
  const currentMonth = asOf.getMonth() + 1 // 1-12
  const monthProgress = computeMonthProgress(asOf)
  const { grid, txByCategory } = buildMonthlyGrid(rows, gbpUsdRate)
  const ytdByCategory = buildYtdByCategory(grid, year, currentMonth)

  const m1 = methodologyM1(grid, year, currentMonth, monthProgress, ytdByCategory)
  const m2 = methodologyM2(grid, year, currentMonth, monthProgress, ytdByCategory)
  const m3 = methodologyM3(grid, txByCategory, year, currentMonth, monthProgress, ytdByCategory, gbpUsdRate)
  const methodologies = [m1, m2, m3]

  const ensemble = buildEnsemble(methodologies, grid, year, currentMonth, monthProgress)
  const backtest = runBacktest(rows, gbpUsdRate, year)
  const bestFit = backtest ? buildBestFit(methodologies, backtest) : null

  return {
    asOf: asOf.toISOString().split('T')[0],
    year,
    currentMonth,
    methodologies,
    ensemble,
    bestFit,
    backtest,
  }
}
