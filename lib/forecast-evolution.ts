import type { SupabaseClient } from '@supabase/supabase-js'
import { getDefaultForecastMethods } from '@/lib/forecasting'

const INCOME_CATEGORIES = ['Income', 'Gift Money', 'Other Income', 'Excluded']
const PAGE_SIZE = 1000

type YearMethod = 'Annual' | 'Linear' | 'Budget' | 'Manual'

type SettingsTimelineRow = {
  category: string
  effective_date: string
  current_year_method: YearMethod | null
  manual_year_forecast: number | null
}

type BudgetTimelineRow = {
  category: string
  effective_date: string
  annual_budget_gbp: number | null
}

type TimelineSetting = {
  effective_date: string
  current_year_method: YearMethod
  manual_year_forecast: number | null
}

type TimelineBudget = {
  effective_date: string
  annual_budget_gbp: number
}

type TxRow = {
  category: string
  date: string
  amount_gbp: number | null
  amount_usd: number | null
}

export type CategoryForecastSnapshot = {
  annualBudget: number
  forecast: number
  gap: number
  ytd: number
}

export type SnapshotByCategory = Map<string, CategoryForecastSnapshot>

const isExpense = (category: string) => !INCOME_CATEGORIES.includes(category)

const toDateOnly = (value: unknown): string => {
  if (!value) return ''
  if (typeof value === 'string') return value.split('T')[0]
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0]
}

const parseISODateUTC = (value: string): Date => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid date format: ${value}. Expected YYYY-MM-DD.`)
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid calendar date: ${value}.`)
  }
  return parsed
}

const toISODateUTC = (value: Date): string => value.toISOString().slice(0, 10)

const addDaysUTC = (value: Date, days: number): Date => {
  const next = new Date(value)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

const dayOfYearUTC = (value: Date): number => {
  const year = value.getUTCFullYear()
  const start = Date.UTC(year, 0, 0)
  const current = Date.UTC(year, value.getUTCMonth(), value.getUTCDate())
  return Math.floor((current - start) / (24 * 60 * 60 * 1000))
}

const totalDaysInYear = (year: number): number => {
  return new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1 ? 366 : 365
}

const toNum = (value: unknown): number => (typeof value === 'number' ? value : Number(value) || 0)

const normalizeAmountGBP = (
  amountGBP: number | null,
  amountUSD: number | null,
  gbpUsdRate: number
): number => {
  if (amountGBP != null && !Number.isNaN(Number(amountGBP))) return Number(amountGBP)
  if (amountUSD != null && !Number.isNaN(Number(amountUSD))) return Number(amountUSD) / gbpUsdRate
  return 0
}

const normalizeManualForecast = (value: number | null | undefined, expense: boolean): number | null => {
  if (value == null || Number.isNaN(Number(value))) return null
  const num = Number(value)
  return expense ? -Math.abs(num) : Math.abs(num)
}

const pickAsOf = <T extends { effective_date: string }>(rows: T[] | undefined, date: string): T | undefined => {
  if (!rows?.length) return undefined
  let lo = 0
  let hi = rows.length - 1
  let ans = -1

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (rows[mid].effective_date <= date) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  return ans >= 0 ? rows[ans] : undefined
}

const ensureSettingTimeline = (
  rows: TimelineSetting[] | undefined,
  current: TimelineSetting | undefined,
  minDate: string
): TimelineSetting[] => {
  const sorted = [...(rows ?? [])].sort((a, b) => a.effective_date.localeCompare(b.effective_date))
  if (sorted.length === 0 && current) {
    return [{ ...current, effective_date: minDate }]
  }
  if (sorted.length > 0 && sorted[0].effective_date > minDate) {
    sorted.unshift({ ...sorted[0], effective_date: minDate })
  }
  return sorted
}

const ensureBudgetTimeline = (
  rows: TimelineBudget[] | undefined,
  current: TimelineBudget | undefined,
  minDate: string
): TimelineBudget[] => {
  const sorted = [...(rows ?? [])].sort((a, b) => a.effective_date.localeCompare(b.effective_date))
  if (sorted.length === 0 && current) {
    return [{ ...current, effective_date: minDate }]
  }
  if (sorted.length > 0 && sorted[0].effective_date > minDate) {
    sorted.unshift({ ...sorted[0], effective_date: minDate })
  }
  return sorted
}

const getCurrentFxRate = async (supabase: SupabaseClient): Promise<number> => {
  const { data } = await supabase
    .from('fx_rate_current')
    .select('gbpusd_rate')
    .order('date', { ascending: false })
    .limit(1)
    .single()
  const rate = data?.gbpusd_rate
  return rate && rate > 0 ? rate : 1.25
}

const fetchTransactionsPaged = async (
  supabase: SupabaseClient,
  userId: string,
  startDate: string,
  endDate: string
): Promise<TxRow[]> => {
  const rows: TxRow[] = []
  let page = 0
  let hasMore = true

  while (hasMore) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('transaction_log')
      .select('category, date, amount_gbp, amount_usd')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)

    if (error) {
      throw new Error(`transaction_log query failed: ${error.message}`)
    }

    const chunk = (data ?? []) as TxRow[]
    rows.push(...chunk)
    hasMore = chunk.length === PAGE_SIZE
    page += 1
  }

  return rows
}

const fetchSettingsHistoryPaged = async (
  supabase: SupabaseClient,
  userId: string,
  endDate: string
): Promise<SettingsTimelineRow[]> => {
  const rows: SettingsTimelineRow[] = []
  let page = 0
  let hasMore = true

  while (hasMore) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('forecast_settings_history')
      .select('category, effective_date, current_year_method, manual_year_forecast')
      .eq('user_id', userId)
      .lte('effective_date', endDate)
      .order('effective_date', { ascending: true })
      .order('category', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)

    if (error) {
      if (error.message.toLowerCase().includes('does not exist')) {
        return []
      }
      throw new Error(`forecast_settings_history query failed: ${error.message}`)
    }

    const chunk = (data ?? []) as SettingsTimelineRow[]
    rows.push(...chunk)
    hasMore = chunk.length === PAGE_SIZE
    page += 1
  }

  return rows
}

const fetchBudgetHistoryPaged = async (
  supabase: SupabaseClient,
  userId: string,
  endDate: string
): Promise<BudgetTimelineRow[]> => {
  const rows: BudgetTimelineRow[] = []
  let page = 0
  let hasMore = true

  while (hasMore) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('budget_targets_history')
      .select('category, effective_date, annual_budget_gbp')
      .eq('user_id', userId)
      .lte('effective_date', endDate)
      .order('effective_date', { ascending: true })
      .order('category', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)

    if (error) {
      if (error.message.toLowerCase().includes('does not exist')) {
        return []
      }
      throw new Error(`budget_targets_history query failed: ${error.message}`)
    }

    const chunk = (data ?? []) as BudgetTimelineRow[]
    rows.push(...chunk)
    hasMore = chunk.length === PAGE_SIZE
    page += 1
  }

  return rows
}

const getDateRange = (startDate: string, endDate: string): string[] => {
  const start = parseISODateUTC(startDate)
  const end = parseISODateUTC(endDate)
  if (start > end) {
    throw new Error(`startDate ${startDate} must be on or before endDate ${endDate}.`)
  }

  const dates: string[] = []
  let cursor = start
  while (cursor <= end) {
    dates.push(toISODateUTC(cursor))
    cursor = addDaysUTC(cursor, 1)
  }
  return dates
}

export async function computeForecastSnapshotsForDates(
  supabase: SupabaseClient,
  userId: string,
  targetDates: string[]
): Promise<Map<string, SnapshotByCategory>> {
  if (targetDates.length === 0) return new Map()

  const dedupedSortedTargetDates = Array.from(new Set(targetDates))
    .map((d) => toISODateUTC(parseISODateUTC(d)))
    .sort((a, b) => a.localeCompare(b))

  const minDate = dedupedSortedTargetDates[0]
  const maxDate = dedupedSortedTargetDates[dedupedSortedTargetDates.length - 1]

  const minYear = parseISODateUTC(minDate).getUTCFullYear()
  const minYearStart = `${minYear}-01-01`

  const [fxRate, currentSettingsRes, currentBudgetsRes, settingsHistory, budgetHistory, txRows] =
    await Promise.all([
      getCurrentFxRate(supabase),
      supabase
        .from('forecast_settings')
        .select('category, current_year_method, manual_year_forecast')
        .eq('user_id', userId),
      supabase
        .from('budget_targets')
        .select('category, annual_budget_gbp')
        .eq('user_id', userId),
      fetchSettingsHistoryPaged(supabase, userId, maxDate),
      fetchBudgetHistoryPaged(supabase, userId, maxDate),
      fetchTransactionsPaged(supabase, userId, minYearStart, maxDate),
    ])

  if (currentSettingsRes.error) {
    throw new Error(`forecast_settings query failed: ${currentSettingsRes.error.message}`)
  }
  if (currentBudgetsRes.error) {
    throw new Error(`budget_targets query failed: ${currentBudgetsRes.error.message}`)
  }

  const categories = new Set<string>()

  const currentSettingsByCategory = new Map<string, TimelineSetting>()
  for (const row of currentSettingsRes.data ?? []) {
    if (!row.category) continue
    categories.add(row.category)
    const defaultMethods = getDefaultForecastMethods(row.category)
    currentSettingsByCategory.set(row.category, {
      effective_date: minDate,
      current_year_method:
        (row.current_year_method as YearMethod | null) ?? defaultMethods.year,
      manual_year_forecast: row.manual_year_forecast ?? null,
    })
  }

  const currentBudgetsByCategory = new Map<string, TimelineBudget>()
  for (const row of currentBudgetsRes.data ?? []) {
    if (!row.category) continue
    categories.add(row.category)
    currentBudgetsByCategory.set(row.category, {
      effective_date: minDate,
      annual_budget_gbp: toNum(row.annual_budget_gbp),
    })
  }

  const settingsHistoryByCategory = new Map<string, TimelineSetting[]>()
  for (const row of settingsHistory) {
    if (!row.category) continue
    const effectiveDate = toDateOnly(row.effective_date)
    if (!effectiveDate) continue
    categories.add(row.category)
    const defaultMethods = getDefaultForecastMethods(row.category)
    if (!settingsHistoryByCategory.has(row.category)) settingsHistoryByCategory.set(row.category, [])
    settingsHistoryByCategory.get(row.category)!.push({
      effective_date: effectiveDate,
      current_year_method:
        (row.current_year_method as YearMethod | null) ?? defaultMethods.year,
      manual_year_forecast: row.manual_year_forecast ?? null,
    })
  }

  const budgetHistoryByCategory = new Map<string, TimelineBudget[]>()
  for (const row of budgetHistory) {
    if (!row.category) continue
    const effectiveDate = toDateOnly(row.effective_date)
    if (!effectiveDate) continue
    categories.add(row.category)
    if (!budgetHistoryByCategory.has(row.category)) budgetHistoryByCategory.set(row.category, [])
    budgetHistoryByCategory.get(row.category)!.push({
      effective_date: effectiveDate,
      annual_budget_gbp: toNum(row.annual_budget_gbp),
    })
  }

  const txByDateCategory = new Map<string, Map<string, number>>()
  for (const tx of txRows) {
    if (!tx.category) continue
    const dateStr = toDateOnly(tx.date)
    if (!dateStr) continue
    categories.add(tx.category)
    const amount = normalizeAmountGBP(tx.amount_gbp, tx.amount_usd, fxRate)
    if (amount === 0) continue
    if (!txByDateCategory.has(dateStr)) txByDateCategory.set(dateStr, new Map())
    const byCategory = txByDateCategory.get(dateStr)!
    byCategory.set(tx.category, (byCategory.get(tx.category) ?? 0) + amount)
  }

  const sortedCategories = Array.from(categories).sort((a, b) => a.localeCompare(b))
  const targetDateSet = new Set(dedupedSortedTargetDates)

  const settingsTimeline = new Map<string, TimelineSetting[]>()
  const budgetTimeline = new Map<string, TimelineBudget[]>()

  for (const category of sortedCategories) {
    settingsTimeline.set(
      category,
      ensureSettingTimeline(
        settingsHistoryByCategory.get(category),
        currentSettingsByCategory.get(category),
        minDate
      )
    )
    budgetTimeline.set(
      category,
      ensureBudgetTimeline(
        budgetHistoryByCategory.get(category),
        currentBudgetsByCategory.get(category),
        minDate
      )
    )
  }

  const snapshots = new Map<string, SnapshotByCategory>()
  const ytdByYearCategory = new Map<string, number>()

  const startCursor = parseISODateUTC(minYearStart)
  const endCursor = parseISODateUTC(maxDate)

  for (let cursor = startCursor; cursor <= endCursor; cursor = addDaysUTC(cursor, 1)) {
    const dateStr = toISODateUTC(cursor)
    const year = cursor.getUTCFullYear()

    const daily = txByDateCategory.get(dateStr)
    if (daily) {
      for (const [category, amount] of daily.entries()) {
        const key = `${year}::${category}`
        ytdByYearCategory.set(key, (ytdByYearCategory.get(key) ?? 0) + amount)
      }
    }

    if (!targetDateSet.has(dateStr)) continue

    const pctElapsed = Math.min(
      Math.max(dayOfYearUTC(cursor) / totalDaysInYear(year), 0),
      1
    )
    const pctRemaining = 1 - pctElapsed

    const byCategory: SnapshotByCategory = new Map()
    for (const category of sortedCategories) {
      const ytd = ytdByYearCategory.get(`${year}::${category}`) ?? 0
      const setting = pickAsOf(settingsTimeline.get(category), dateStr)
      const budget = pickAsOf(budgetTimeline.get(category), dateStr)
      const annualBudget = budget?.annual_budget_gbp ?? 0
      const yearMethod = setting?.current_year_method ?? getDefaultForecastMethods(category).year
      const expense = isExpense(category)
      const manualYear = normalizeManualForecast(setting?.manual_year_forecast ?? null, expense)

      let forecast = ytd
      if (yearMethod === 'Manual') {
        forecast = manualYear ?? ytd
      } else if (yearMethod === 'Annual') {
        forecast = ytd + annualBudget * pctRemaining
      } else if (yearMethod === 'Linear') {
        forecast = pctElapsed > 0 ? ytd / pctElapsed : ytd
      } else if (yearMethod === 'Budget') {
        forecast = expense ? Math.min(annualBudget, ytd) : Math.max(annualBudget, ytd)
      }

      byCategory.set(category, {
        annualBudget,
        forecast,
        gap: annualBudget - forecast,
        ytd,
      })
    }

    snapshots.set(dateStr, byCategory)
  }

  return snapshots
}

export async function computeForecastSnapshotForDate(
  supabase: SupabaseClient,
  userId: string,
  date: string
): Promise<SnapshotByCategory> {
  const snapshots = await computeForecastSnapshotsForDates(supabase, userId, [date])
  return snapshots.get(toISODateUTC(parseISODateUTC(date))) ?? new Map()
}

export async function computeForecastGapSeries(
  supabase: SupabaseClient,
  userId: string,
  startDate: string,
  endDate: string
): Promise<{ date: string; gap: number }[]> {
  const dates = getDateRange(startDate, endDate)
  const snapshots = await computeForecastSnapshotsForDates(supabase, userId, dates)

  return dates.map((date) => {
    const byCategory = snapshots.get(date) ?? new Map()
    let gap = 0
    for (const [category, values] of byCategory.entries()) {
      if (!isExpense(category)) continue
      gap += values.gap
    }
    return { date, gap }
  })
}

export function buildDateRange(startDate: string, endDate: string): string[] {
  return getDateRange(startDate, endDate)
}
