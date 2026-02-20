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
 * Per-category headrooms and by-methodology aggregation (min headroom per methodology).
 * Methodology headroom is null if no categories in that bucket or all Manual.
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
    const headrooms = categories
      .filter((c) => c.method === method)
      .map((c) => headroomByCategory.get(c.category))
      .filter((h): h is number => h != null && Number.isFinite(h))
    if (headrooms.length === 0) {
      headroomByMethodology.set(method, null)
    } else {
      headroomByMethodology.set(method, Math.min(...headrooms))
    }
  }

  return { headroomByCategory, headroomByMethodology }
}
