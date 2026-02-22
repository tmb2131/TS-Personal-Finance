const EXCLUDED_CATEGORIES = ['Income', 'Gift Money', 'Other Income', 'Excluded']

export type ForecastBridgeDriver = {
  category: string
  startForecast: number
  endForecast: number
  delta: number
}

export type ForecastBridgePayload = {
  startDate: string
  endDate: string
  expensesBudgetStart: number
  expensesForecastStart: number
  expensesBudgetEnd: number
  expensesForecastEnd: number
  totalStart: number
  totalEnd: number
  drivers: ForecastBridgeDriver[]
}

export function buildForecastBridgeFromSnapshots(
  startDate: string,
  endDate: string,
  startSnapshot: Map<string, { annualBudget: number; forecast: number; gap: number }>,
  endSnapshot: Map<string, { annualBudget: number; forecast: number; gap: number }>
): ForecastBridgePayload {
  const startGapMap = new Map<string, { budget: number; forecast: number; gap: number }>()
  for (const [category, values] of startSnapshot.entries()) {
    if (EXCLUDED_CATEGORIES.includes(category)) continue
    startGapMap.set(category, {
      budget: values.annualBudget,
      forecast: values.forecast,
      gap: values.gap,
    })
  }

  const endGapMap = new Map<string, { budget: number; forecast: number; gap: number }>()
  for (const [category, values] of endSnapshot.entries()) {
    if (EXCLUDED_CATEGORIES.includes(category)) continue
    endGapMap.set(category, {
      budget: values.annualBudget,
      forecast: values.forecast,
      gap: values.gap,
    })
  }

  const expensesBudgetStart = [...startGapMap.values()].reduce((s, x) => s + x.budget, 0)
  const expensesForecastStart = [...startGapMap.values()].reduce((s, x) => s + x.forecast, 0)
  const expensesBudgetEnd = [...endGapMap.values()].reduce((s, x) => s + x.budget, 0)
  const expensesForecastEnd = [...endGapMap.values()].reduce((s, x) => s + x.forecast, 0)
  const totalStart = expensesBudgetStart - expensesForecastStart
  const totalEnd = expensesBudgetEnd - expensesForecastEnd

  const allCategories = new Set([...startGapMap.keys(), ...endGapMap.keys()])
  const deltas: ForecastBridgeDriver[] = []
  for (const category of allCategories) {
    const startGap = startGapMap.get(category)?.gap ?? 0
    const endGap = endGapMap.get(category)?.gap ?? 0
    const delta = endGap - startGap
    deltas.push({
      category,
      startForecast: startGap,
      endForecast: endGap,
      delta,
    })
  }

  deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  const top6ByAbs = deltas.slice(0, 6)
  const rest = deltas.slice(6)

  const netChange = totalEnd - totalStart
  if (netChange < 0) {
    top6ByAbs.sort((a, b) => a.delta - b.delta)
  } else {
    top6ByAbs.sort((a, b) => b.delta - a.delta)
  }

  const other: ForecastBridgeDriver = {
    category: 'Other',
    startForecast: rest.reduce((s, d) => s + d.startForecast, 0),
    endForecast: rest.reduce((s, d) => s + d.endForecast, 0),
    delta: rest.reduce((s, d) => s + d.delta, 0),
  }
  const drivers =
    other.delta === 0 && rest.length === 0 ? top6ByAbs : [...top6ByAbs, other]

  return {
    startDate,
    endDate,
    expensesBudgetStart,
    expensesForecastStart,
    expensesBudgetEnd,
    expensesForecastEnd,
    totalStart,
    totalEnd,
    drivers,
  }
}

export function toLocalDateString(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function toDateOnly(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value.split('T')[0]
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0]
}
