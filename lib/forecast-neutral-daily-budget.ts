type YearMethod = 'Annual' | 'Linear' | 'Budget' | 'Manual'

export interface NeutralBudgetCategoryInput {
  category: string
  annualBudget: number
  ytdYesterday: number
  method: YearMethod
  manualYearForecast: number | null
  spendDirection: 1 | -1
}

export interface NeutralBudgetInput {
  dayOfYear: number
  daysInYear: number
  categories: NeutralBudgetCategoryInput[]
  todaySpendByCategory: Map<string, number>
  spendWeightByCategory: Map<string, number>
}

export interface NeutralBudgetResult {
  neutralSpend: number | null
  usedSpend: number
  usedPercent: number | null
  deltaAtZero: number
  deltaAtUsed: number
}

const EPS = 1e-9

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeManualForecast = (value: number | null | undefined, expense: boolean): number | null => {
  if (value == null) return null
  const num = toNumber(value)
  if (!Number.isFinite(num)) return null
  return expense ? -Math.abs(num) : Math.abs(num)
}

const computeForecast = (
  method: YearMethod,
  annualBudget: number,
  ytdValue: number,
  pctElapsed: number,
  manualYearForecast: number | null
): number => {
  if (method === 'Manual') {
    return normalizeManualForecast(manualYearForecast, true) ?? ytdValue
  }

  if (method === 'Linear') {
    return pctElapsed > 0 ? ytdValue / pctElapsed : ytdValue
  }

  if (method === 'Budget') {
    return Math.min(annualBudget, ytdValue)
  }

  // Annual (default): YTD + (annual budget × % year remaining)
  const pctRemaining = 1 - pctElapsed
  return ytdValue + annualBudget * pctRemaining
}

const computeGapDelta = (
  category: NeutralBudgetCategoryInput,
  todaySpendRaw: number,
  pctPrev: number,
  pctToday: number
): number => {
  const ytdPrev = category.ytdYesterday
  const ytdToday = ytdPrev + todaySpendRaw

  const forecastPrev = computeForecast(
    category.method,
    category.annualBudget,
    ytdPrev,
    pctPrev,
    category.manualYearForecast
  )
  const forecastToday = computeForecast(
    category.method,
    category.annualBudget,
    ytdToday,
    pctToday,
    category.manualYearForecast
  )

  // gap = budget - forecast, so day-over-day gap delta is prevForecast - todayForecast
  return forecastPrev - forecastToday
}

const buildNormalizedWeights = (
  categories: NeutralBudgetCategoryInput[],
  spendWeightByCategory: Map<string, number>
): Map<string, number> => {
  const weights = new Map<string, number>()
  const total = categories.reduce((sum, category) => {
    const w = Math.max(0, toNumber(spendWeightByCategory.get(category.category) ?? 0))
    if (w > 0) weights.set(category.category, w)
    return sum + w
  }, 0)

  if (total > EPS) {
    weights.forEach((value, key) => {
      weights.set(key, value / total)
    })
    return weights
  }

  const equalWeight = categories.length > 0 ? 1 / categories.length : 0
  categories.forEach((category) => {
    weights.set(category.category, equalWeight)
  })
  return weights
}

const solveNeutralSpend = (
  categories: NeutralBudgetCategoryInput[],
  weights: Map<string, number>,
  pctPrev: number,
  pctToday: number,
  usedSpend: number
): number | null => {
  if (categories.length === 0) return null

  const deltaForTotalSpend = (totalSpend: number): number => {
    return categories.reduce((sum, category) => {
      const weight = weights.get(category.category) ?? 0
      const todaySpendRaw = category.spendDirection * totalSpend * weight
      return sum + computeGapDelta(category, todaySpendRaw, pctPrev, pctToday)
    }, 0)
  }

  const deltaAtZero = deltaForTotalSpend(0)
  if (Math.abs(deltaAtZero) <= 1e-6) return 0
  if (deltaAtZero > 0) return 0

  let high = Math.max(100, usedSpend * 2, Math.abs(deltaAtZero) * 2, 1)
  let deltaAtHigh = deltaForTotalSpend(high)
  while (deltaAtHigh <= 0 && high < 10_000_000) {
    high *= 2
    deltaAtHigh = deltaForTotalSpend(high)
  }

  if (deltaAtHigh <= 0) return null

  let low = 0
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2
    const deltaMid = deltaForTotalSpend(mid)
    if (deltaMid > 0) {
      high = mid
    } else {
      low = mid
    }
  }

  return (low + high) / 2
}

export function computeForecastNeutralDailyBudget(input: NeutralBudgetInput): NeutralBudgetResult {
  const { dayOfYear, daysInYear, categories, todaySpendByCategory, spendWeightByCategory } = input

  if (categories.length === 0 || dayOfYear <= 1 || daysInYear <= 0) {
    return {
      neutralSpend: null,
      usedSpend: 0,
      usedPercent: null,
      deltaAtZero: 0,
      deltaAtUsed: 0,
    }
  }

  const pctToday = Math.min(Math.max(dayOfYear / daysInYear, 0), 1)
  const pctPrev = Math.min(Math.max((dayOfYear - 1) / daysInYear, 0), 1)

  const usedSpend = categories.reduce((sum, category) => {
    const raw = toNumber(todaySpendByCategory.get(category.category) ?? 0)
    return sum + raw * category.spendDirection
  }, 0)

  const deltaAtZero = categories.reduce((sum, category) => {
    return sum + computeGapDelta(category, 0, pctPrev, pctToday)
  }, 0)

  const deltaAtUsed = categories.reduce((sum, category) => {
    const raw = toNumber(todaySpendByCategory.get(category.category) ?? 0)
    return sum + computeGapDelta(category, raw, pctPrev, pctToday)
  }, 0)

  const weights = buildNormalizedWeights(categories, spendWeightByCategory)
  const neutralSpend = solveNeutralSpend(categories, weights, pctPrev, pctToday, Math.max(usedSpend, 0))
  const usedPercent = neutralSpend != null && neutralSpend > EPS ? (usedSpend / neutralSpend) * 100 : null

  return {
    neutralSpend,
    usedSpend,
    usedPercent,
    deltaAtZero,
    deltaAtUsed,
  }
}
