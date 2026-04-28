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

// Annual-total CV above which a category's seasonal pattern is considered noise; M1/M2 fall back
// to a flat annual median split across 12 months instead of trying to fit the seasonality.
const LUMPY_CV_THRESHOLD = 0.5

// Min months of last 12 a counterparty must fire for M3 to consider it recurring. 6 catches
// quarterly, bimonthly, and annually-billed-but-monthly-amortised subscriptions.
const RECURRING_MIN_ACTIVE_MONTHS = 6

// Max month-to-month CV for an M3 recurring cluster. 0.25 tolerates real-world price drift on
// subscriptions (annual price increases, FX-priced services).
const RECURRING_MAX_CV = 0.25

// Backtest err% is meaningful only when the actual amount is large enough that small absolute
// errors don't dominate the percentage. Below this threshold, mark the row low-confidence.
const LOW_CONFIDENCE_MIN_ACTUAL_GBP = 100

// A category with fewer observed training years than this is mostly fallback-driven; flag it.
const LOW_CONFIDENCE_MIN_OBSERVED_YEARS = 2

// Number of recent completed years to backtest and average across. Single-year backtest is too
// noisy — one anomalous year can make a methodology look terrible.
const BACKTEST_LOOKBACK_YEARS = 2

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
  /** Sparse history, lumpy spend, or small absolute actual — interpret err% with care. */
  lowConfidence: boolean
}

export type BacktestResult = {
  /** Year that was forecast (most recent completed year). */
  year: number
  /** Years included in the backtest. Length > 1 means err% is averaged across years. */
  backtestYears: number[]
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
  // Central tendency is the median across observed years — robust to one-off spikes
  // (a single £2k vacation in July of one year doesn't propagate as a £667 July expectation).
  const monthValues: number[][] = Array.from({ length: 12 }, () => [])
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
      monthValues[m - 1].push(grid[category]?.[ymKey(y, m)] ?? 0)
    }
  }
  return {
    means: monthValues.map((vs) => median(vs)),
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
    const { means: rawSeasonal, observedYears } = computeSeasonalMeans(grid, category, trainingYears)
    const annualValues = computeAnnualValues(grid, category, trainingYears)
    const annualCV = computeAnnualCV(annualValues)
    // Lumpy-category fallback: when YoY annual totals swing wildly, the seasonal pattern is
    // noise. Flatten to median annual / 12 — preserves the typical annual scale without
    // pretending to know which month the lumps will land in.
    const seasonal =
      annualCV > LUMPY_CV_THRESHOLD && annualValues.length >= 2
        ? new Array(12).fill(median(annualValues) / 12)
        : rawSeasonal
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

/**
 * Annual totals for the years where the category had any activity. Years with zero activity are
 * skipped (mirrors `computeSeasonalMeans` so a newly-tracked category isn't dragged toward 0).
 */
function computeAnnualValues(
  grid: MonthlyGrid,
  category: string,
  trainingYears: number[],
): number[] {
  const values: number[] = []
  for (const y of trainingYears) {
    let yearHasData = false
    for (let m = 1; m <= 12; m++) {
      if (grid[category]?.[ymKey(y, m)] != null) {
        yearHasData = true
        break
      }
    }
    if (!yearHasData) continue
    values.push(computeAnnualTotal(grid, category, y))
  }
  return values
}

/** CV across annual totals. 0 when fewer than 2 values or mean ≤ 0. */
function computeAnnualCV(annualValues: number[]): number {
  if (annualValues.length < 2) return 0
  const mean = annualValues.reduce((s, v) => s + v, 0) / annualValues.length
  if (mean <= 0) return 0
  const variance =
    annualValues.reduce((s, v) => s + (v - mean) ** 2, 0) / annualValues.length
  return Math.sqrt(variance) / mean
}

/**
 * A category's backtest err% is "low confidence" when one of:
 *  - too few observed training years (mostly fallback-driven)
 *  - high YoY annual-total volatility (lumpy spend — any forecast will look bad)
 *  - small absolute actual (small denominator inflates the percentage)
 */
function isLowConfidence(args: {
  observedYears: number
  annualCV: number
  actual: number
}): boolean {
  return (
    args.observedYears < LOW_CONFIDENCE_MIN_OBSERVED_YEARS ||
    args.annualCV > LUMPY_CV_THRESHOLD ||
    args.actual < LOW_CONFIDENCE_MIN_ACTUAL_GBP
  )
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
    const annualValues = computeAnnualValues(grid, category, trainingYears)
    const annualCV = computeAnnualCV(annualValues)
    const isLumpy = annualCV > LUMPY_CV_THRESHOLD && annualValues.length >= 2

    let monthlyProjected: number[]
    if (isLumpy) {
      // Lumpy: a category swinging ±100% YoY has no meaningful trend signal. Skip the YoY
      // scaling and project a flat annual median split evenly across months.
      const flat = median(annualValues) / 12
      monthlyProjected = new Array(12).fill(flat)
    } else {
      const seasonalSum = seasonal.reduce((s, v) => s + v, 0)
      // Seasonal index normalized to mean=1 across observed months
      const seasonalIndex =
        seasonalSum > 0 ? seasonal.map((v) => safeDiv(v * 12, seasonalSum, 1)) : new Array(12).fill(1)

      const priorYearTotal = computeAnnualTotal(grid, category, year - 1)
      const growth = computeYoYGrowth(grid, category, year)
      const projectedAnnual =
        priorYearTotal > 0 ? priorYearTotal * (1 + growth) : seasonalSum // fallback to M1's annual

      monthlyProjected = seasonalIndex.map((idx) => (projectedAnnual / 12) * idx)
    }

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
      // Min active months: catches quarterly/bimonthly/term-time bills, not just strictly monthly.
      if (entry.months.size < RECURRING_MIN_ACTIVE_MONTHS) continue
      // Gate on month-to-month amount stability: tolerates real-world price drift.
      const monthly = Array.from(entry.monthAmount.values())
      const mean = monthly.reduce((s, v) => s + v, 0) / monthly.length
      if (mean <= 0) continue
      const variance =
        monthly.reduce((s, v) => s + (v - mean) ** 2, 0) / monthly.length
      const cv = Math.sqrt(variance) / mean
      if (cv > RECURRING_MAX_CV) continue
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
      'Detects recurring fixed spend (counterparty + amount, ≥6 of last 12 months) and projects only the variable portion seasonally.',
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
 * Per-year backtest result used internally by `runBacktest` to merge multiple years.
 * Holds the forecast and actual GBP values per category plus the absolute error so
 * the orchestrator can compute weighted MAPE across years correctly.
 */
type BacktestYearResult = {
  year: number
  categories: {
    category: string
    actual: number
    m1: number
    m2: number
    m3: number
    m1AbsErr: number
    m2AbsErr: number
    m3AbsErr: number
    /** Per-category MAPE for this single year (capped at 1000%). */
    m1Mape: number
    m2Mape: number
    m3Mape: number
    /** From `computeSeasonalMeans` against this year's training set. */
    observedYears: number
    /** From `computeAnnualCV` against this year's training set. */
    annualCV: number
  }[]
}

const MAPE_CAP = 10 // 1000%
const capMape = (x: number) => Math.min(MAPE_CAP, Math.max(0, x))

/**
 * Backtest a single historical year: re-run each methodology as if it were 1 Jan of that year,
 * using ONLY data strictly before it, then compare to actual full-year spend.
 * Returns null if training data doesn't reach far enough back.
 */
function runBacktestForYear(
  rows: ForecastTxRow[],
  gbpUsdRate: number,
  backtestYear: number,
): BacktestYearResult | null {
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

  const ytdByCategory: Record<string, number[]> = {}
  for (const cat of Object.keys(trainingGrid)) {
    ytdByCategory[cat] = new Array(12).fill(0)
  }
  // currentMonth=0 means no month is current — every month is a clean forecast.
  const m1 = methodologyM1(trainingGrid, backtestYear, 0, 1, ytdByCategory)
  const m2 = methodologyM2(trainingGrid, backtestYear, 0, 1, ytdByCategory)
  const m3 = methodologyM3(trainingGrid, trainingTxByCategory, backtestYear, 0, 1, ytdByCategory, gbpUsdRate)

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
  const trainingYearsForBacktest = [backtestYear - 3, backtestYear - 2, backtestYear - 1]

  const categories = Array.from(allCats)
    .sort((a, b) => a.localeCompare(b))
    .map((category) => {
      const actual = actualByCategory[category] ?? 0
      const v1 = m1.byCategory.find((c) => c.category === category)?.fullYear ?? 0
      const v2 = m2.byCategory.find((c) => c.category === category)?.fullYear ?? 0
      const v3 = m3.byCategory.find((c) => c.category === category)?.fullYear ?? 0
      const mape = (forecast: number) =>
        actual === 0 ? (forecast === 0 ? 0 : 1) : capMape(Math.abs(forecast - actual) / actual)
      const { observedYears } = computeSeasonalMeans(
        trainingGrid,
        category,
        trainingYearsForBacktest,
      )
      const annualCV = computeAnnualCV(
        computeAnnualValues(trainingGrid, category, trainingYearsForBacktest),
      )
      return {
        category,
        actual: round(actual),
        m1: round(v1),
        m2: round(v2),
        m3: round(v3),
        m1AbsErr: Math.abs(v1 - actual),
        m2AbsErr: Math.abs(v2 - actual),
        m3AbsErr: Math.abs(v3 - actual),
        m1Mape: mape(v1),
        m2Mape: mape(v2),
        m3Mape: mape(v3),
        observedYears,
        annualCV,
      }
    })
    .filter((c) => c.actual > 0 || c.m1 + c.m2 + c.m3 > 0)

  return { year: backtestYear, categories }
}

/**
 * Backtest re-runs each methodology against the most recent completed years, using only data
 * strictly before each year. Per-category err% is averaged across years; portfolio weighted MAPE
 * is recomputed from the combined absolute errors and combined actuals (not an average of ratios).
 */
function runBacktest(
  rows: ForecastTxRow[],
  gbpUsdRate: number,
  currentYear: number,
): BacktestResult | null {
  const candidateYears: number[] = []
  for (let i = 1; i <= BACKTEST_LOOKBACK_YEARS; i++) candidateYears.push(currentYear - i)

  const yearResults = candidateYears
    .map((y) => runBacktestForYear(rows, gbpUsdRate, y))
    .filter((r): r is BacktestYearResult => r !== null)
    .sort((a, b) => a.year - b.year) // oldest → newest

  if (yearResults.length === 0) return null

  const mostRecent = yearResults[yearResults.length - 1]
  const backtestYears = yearResults.map((r) => r.year)

  // Aggregate per-category across years. Display GBP columns from the most-recent year so the
  // "Actual" column has a single year's meaning; average the MAPEs across the years where the
  // category appeared.
  const allCategories = new Set<string>()
  for (const yr of yearResults) for (const c of yr.categories) allCategories.add(c.category)

  const categories: BacktestCategoryEntry[] = Array.from(allCategories)
    .sort((a, b) => a.localeCompare(b))
    .map((category) => {
      const recent = mostRecent.categories.find((c) => c.category === category)
      const m1Mapes: number[] = []
      const m2Mapes: number[] = []
      const m3Mapes: number[] = []
      for (const yr of yearResults) {
        const c = yr.categories.find((cc) => cc.category === category)
        if (!c) continue
        m1Mapes.push(c.m1Mape)
        m2Mapes.push(c.m2Mape)
        m3Mapes.push(c.m3Mape)
      }
      const avg = (arr: number[]) =>
        arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length
      const actual = recent?.actual ?? 0
      return {
        category,
        actual: round(actual),
        m1: round(recent?.m1 ?? 0),
        m2: round(recent?.m2 ?? 0),
        m3: round(recent?.m3 ?? 0),
        m1Mape: avg(m1Mapes),
        m2Mape: avg(m2Mapes),
        m3Mape: avg(m3Mapes),
        lowConfidence: isLowConfidence({
          observedYears: recent?.observedYears ?? 0,
          annualCV: recent?.annualCV ?? 0,
          actual,
        }),
      }
    })

  // Totals: GBP columns from most-recent year (matches the per-row "Actual"); weighted MAPE
  // uses Σ|err| over ALL backtested years divided by Σ actual over ALL backtested years —
  // averaging two ratios biases small years.
  const totalsActualAllYears = yearResults.reduce(
    (s, yr) => s + yr.categories.reduce((ss, c) => ss + c.actual, 0),
    0,
  )
  const totalsAbsErrAllYears = (key: 'm1AbsErr' | 'm2AbsErr' | 'm3AbsErr') =>
    yearResults.reduce(
      (s, yr) => s + yr.categories.reduce((ss, c) => ss + c[key], 0),
      0,
    )
  const totals = {
    actual: round(mostRecent.categories.reduce((s, c) => s + c.actual, 0)),
    m1: round(mostRecent.categories.reduce((s, c) => s + c.m1, 0)),
    m2: round(mostRecent.categories.reduce((s, c) => s + c.m2, 0)),
    m3: round(mostRecent.categories.reduce((s, c) => s + c.m3, 0)),
    m1Mape: totalsActualAllYears > 0 ? totalsAbsErrAllYears('m1AbsErr') / totalsActualAllYears : 0,
    m2Mape: totalsActualAllYears > 0 ? totalsAbsErrAllYears('m2AbsErr') / totalsActualAllYears : 0,
    m3Mape: totalsActualAllYears > 0 ? totalsAbsErrAllYears('m3AbsErr') / totalsActualAllYears : 0,
  }

  let bestOverall: MethodologyId = 'm1'
  if (totals.m2Mape < totals.m1Mape && totals.m2Mape <= totals.m3Mape) bestOverall = 'm2'
  else if (totals.m3Mape < totals.m1Mape && totals.m3Mape < totals.m2Mape) bestOverall = 'm3'

  return { year: mostRecent.year, backtestYears, categories, totals, bestOverall }
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
