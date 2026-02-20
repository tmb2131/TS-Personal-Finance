export type YearMethod = 'Annual' | 'Linear' | 'Budget' | 'Manual'

export interface CategoryHeadroomInput {
  category: string
  annualBudget: number
  ytdYesterday: number
  todaySpend: number
  method: YearMethod
  manualYearForecast: number | null
}

export interface TodayHeadroomInput {
  dayOfYear: number
  daysInYear: number
  todaySpendByCategory: Map<string, number>
  categories: Array<{
    category: string
    annualBudget: number
    ytdYesterday: number
    method: YearMethod
    manualYearForecast: number | null
  }>
}

const EPS = 1e-6

function toNum(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const p = Number(value)
  return Number.isFinite(p) ? p : 0
}

function normalizeManualForecast(value: number | null | undefined): number | null {
  if (value == null) return null
  const n = toNum(value)
  if (!Number.isFinite(n)) return null
  return -Math.abs(n) // expense
}

/** Single-category forecast (expense logic): matches forecast-neutral-daily-budget / forecasting. */
function computeForecast(
  method: YearMethod,
  annualBudget: number,
  ytdValue: number,
  pctElapsed: number,
  manualYearForecast: number | null
): number {
  if (method === 'Manual') {
    return normalizeManualForecast(manualYearForecast) ?? ytdValue
  }
  if (method === 'Linear') {
    return pctElapsed > 0 ? ytdValue / pctElapsed : ytdValue
  }
  if (method === 'Budget') {
    return Math.min(annualBudget, ytdValue)
  }
  const pctRemaining = 1 - pctElapsed
  return ytdValue + annualBudget * pctRemaining
}

/** Total forecast today = sum over all categories of F_c(today). */
function totalForecastToday(
  categories: TodayHeadroomInput['categories'],
  todaySpendByCategory: Map<string, number>,
  pctToday: number
): number {
  return categories.reduce((sum, row) => {
    const ytd = row.ytdYesterday + (todaySpendByCategory.get(row.category) ?? 0)
    return sum + computeForecast(row.method, row.annualBudget, ytd, pctToday, row.manualYearForecast)
  }, 0)
}

/** Total forecast tomorrow if we add `extraInMethodology` to categories using `methodology`. Extra is distributed equally across that methodology's categories. */
function totalForecastTomorrowWithExtraInMethodology(
  categories: TodayHeadroomInput['categories'],
  todaySpendByCategory: Map<string, number>,
  pctTomorrow: number,
  methodology: YearMethod,
  extraInMethodology: number
): number {
  const inMethod = categories.filter((c) => c.method === methodology)
  const n = inMethod.length
  const extraPerCategory = n > 0 ? extraInMethodology / n : 0
  return categories.reduce((sum, row) => {
    const todaySpend = todaySpendByCategory.get(row.category) ?? 0
    const extra = row.method === methodology ? extraPerCategory : 0
    const ytdTomorrow = row.ytdYesterday + todaySpend + extra
    return sum + computeForecast(row.method, row.annualBudget, ytdTomorrow, pctTomorrow, row.manualYearForecast)
  }, 0)
}

/** Solve for X >= 0 such that totalForecastTomorrow(..., methodology, X) = totalToday. Returns null for Manual (forecast independent of YTD). */
function solveHeadroomForMethodology(
  categories: TodayHeadroomInput['categories'],
  todaySpendByCategory: Map<string, number>,
  pctToday: number,
  pctTomorrow: number,
  methodology: YearMethod
): number | null {
  if (methodology === 'Manual') return null
  const inMethod = categories.filter((c) => c.method === methodology)
  if (inMethod.length === 0) return null

  const totalToday = totalForecastToday(categories, todaySpendByCategory, pctToday)
  const totalTomorrowAtZero = totalForecastTomorrowWithExtraInMethodology(
    categories,
    todaySpendByCategory,
    pctTomorrow,
    methodology,
    0
  )

  if (totalTomorrowAtZero >= totalToday - EPS) return 0

  let high = Math.max(1000, Math.abs(totalToday - totalTomorrowAtZero) * 2, 1)
  while (
    totalForecastTomorrowWithExtraInMethodology(
      categories,
      todaySpendByCategory,
      pctTomorrow,
      methodology,
      high
    ) < totalToday &&
    high < 1e8
  ) {
    high *= 2
  }
  let low = 0
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2
    const tot = totalForecastTomorrowWithExtraInMethodology(
      categories,
      todaySpendByCategory,
      pctTomorrow,
      methodology,
      mid
    )
    if (tot < totalToday - EPS) low = mid
    else high = mid
  }
  return Math.max(0, (low + high) / 2)
}

/**
 * Per-category headroom: additional spend X in that category such that
 * that category's forecast as of tomorrow (YTD + todaySpend + X) equals
 * that category's forecast as of today.
 * Returns null for Manual (forecast fixed).
 */
export function computeCategoryHeadroom(
  input: CategoryHeadroomInput,
  pctElapsedToday: number,
  pctElapsedTomorrow: number
): number | null {
  const { annualBudget, ytdYesterday, todaySpend, method } = input
  if (method === 'Manual') return null

  const ytdPlusToday = ytdYesterday + todaySpend

  if (method === 'Annual') {
    const pctRemainingToday = 1 - pctElapsedToday
    const pctRemainingTomorrow = 1 - pctElapsedTomorrow
    const X = annualBudget * (pctRemainingToday - pctRemainingTomorrow)
    return Math.max(0, X)
  }

  if (method === 'Linear') {
    if (pctElapsedToday <= 0) return null
    const ratio = pctElapsedTomorrow / pctElapsedToday
    const X = ytdPlusToday * (ratio - 1)
    return Math.max(0, X)
  }

  if (method === 'Budget') {
    const X = Math.max(0, annualBudget - ytdPlusToday)
    return X
  }

  return null
}

/**
 * Per-category headrooms (isolated) and by-methodology headroom using overall forecast.
 * Methodology headroom = X such that if we add X to that methodology's categories,
 * tomorrow's total (all-categories) forecast = today's total forecast. Cross-effect:
 * spend in one methodology reduces headroom for others.
 */
export function computeTodayHeadroom(input: TodayHeadroomInput): {
  headroomByCategory: Map<string, number | null>
  headroomByMethodology: Map<YearMethod, number | null>
} {
  const { dayOfYear, daysInYear, todaySpendByCategory, categories } = input
  const headroomByCategory = new Map<string, number | null>()

  const pctToday = Math.min(Math.max(dayOfYear / daysInYear, 0), 1)
  const pctTomorrow = Math.min(Math.max((dayOfYear + 1) / daysInYear, 0), 1)

  for (const row of categories) {
    const todaySpend = todaySpendByCategory.get(row.category) ?? 0
    const headroom = computeCategoryHeadroom(
      {
        category: row.category,
        annualBudget: row.annualBudget,
        ytdYesterday: row.ytdYesterday,
        todaySpend,
        method: row.method,
        manualYearForecast: row.manualYearForecast,
      },
      pctToday,
      pctTomorrow
    )
    headroomByCategory.set(row.category, headroom)
  }

  const headroomByMethodology = new Map<YearMethod, number | null>()
  const methods: YearMethod[] = ['Annual', 'Budget', 'Linear', 'Manual']
  for (const method of methods) {
    const headroom = solveHeadroomForMethodology(
      categories,
      todaySpendByCategory,
      pctToday,
      pctTomorrow,
      method
    )
    headroomByMethodology.set(method, headroom)
  }

  return { headroomByCategory, headroomByMethodology }
}
