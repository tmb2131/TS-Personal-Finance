import type { YoYBridgeMeta, YoYNetWorth } from '@/lib/types'

export const YOY_BRIDGE_CATEGORY_ORDER = [
  'Year Start',
  'Income',
  'Gift Money',
  'Expenses',
  'FX Impact',
  'Investment Return YTD',
  'Year End',
] as const

export function parseYoYBridgeMeta(raw: unknown): YoYBridgeMeta | null {
  if (!raw || typeof raw !== 'object') return null
  const meta = raw as Record<string, unknown>
  const forecastYear = Number(meta.forecast_year)
  const yearStartDate = meta.year_start_date
  const actualAsOfDate = meta.actual_as_of_date
  const forecastYearEndDate = meta.forecast_year_end_date
  if (
    !Number.isFinite(forecastYear) ||
    typeof yearStartDate !== 'string' ||
    typeof actualAsOfDate !== 'string' ||
    typeof forecastYearEndDate !== 'string'
  ) {
    return null
  }
  return {
    forecast_year: forecastYear,
    year_start_date: yearStartDate,
    actual_as_of_date: actualAsOfDate,
    forecast_year_end_date: forecastYearEndDate,
  }
}

function formatDisplayDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return isoDate
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatYoYBridgeSubtitle(meta: YoYBridgeMeta | null): string | null {
  if (!meta) return null
  return `Forecast to Dec 31, ${meta.forecast_year} · based on actuals through ${formatDisplayDate(meta.actual_as_of_date)}`
}

export function sortYoYBridgeRows(rows: YoYNetWorth[]): YoYNetWorth[] {
  const orderIndex = new Map<string, number>(
    YOY_BRIDGE_CATEGORY_ORDER.map((category, index) => [category, index])
  )
  return [...rows].sort((a, b) => {
    const aIndex = orderIndex.get(a.category) ?? Number.MAX_SAFE_INTEGER
    const bIndex = orderIndex.get(b.category) ?? Number.MAX_SAFE_INTEGER
    if (aIndex !== bIndex) return aIndex - bIndex
    return a.category.localeCompare(b.category)
  })
}
