import type { SupabaseClient } from '@supabase/supabase-js'
import { computeExpenseYtdByCategory } from '@/lib/expense-ytd'
import { todayLocalDateString } from '@/lib/date-utils'
import { ForecastSetting, AnnualTrend, MonthlyTrend } from '@/lib/types'

const INCOME_CATEGORIES = ['Income', 'Gift Money', 'Other Income', 'Excluded']

type YearMethod = 'Annual' | 'Linear' | 'Budget' | 'Manual'
type MonthMethod = 'Linear' | 'Average' | 'Manual' | 'MTD'

interface ForecastSettingRow {
  category: string
  current_year_method: YearMethod
  current_month_method: MonthMethod
  manual_year_forecast?: number | null
  manual_month_forecast?: number | null
}

const defaultYearMethod: YearMethod = 'Annual'
const defaultMonthMethod: MonthMethod = 'Linear'

const DEFAULT_METHODS_BY_CATEGORY: Record<string, { year: YearMethod; month: MonthMethod }> = {
  Bills: { year: 'Annual', month: 'Average' },
  Business: { year: 'Budget', month: 'Linear' },
  Cash: { year: 'Linear', month: 'Average' },
  Charity: { year: 'Budget', month: 'Linear' },
  Education: { year: 'Annual', month: 'Average' },
  Entertainment: { year: 'Linear', month: 'Linear' },
  'Food & Drink': { year: 'Linear', month: 'Linear' },
  General: { year: 'Linear', month: 'Average' },
  Gift: { year: 'Budget', month: 'Linear' },
  'Gym & Health': { year: 'Annual', month: 'Average' },
  Holidays: { year: 'Annual', month: 'Linear' },
  Housing: { year: 'Annual', month: 'Linear' },
  Investments: { year: 'Annual', month: 'Average' },
  Kids: { year: 'Budget', month: 'Average' },
  'Personal Care': { year: 'Linear', month: 'Linear' },
  Pets: { year: 'Linear', month: 'Linear' },
  'Public Transport': { year: 'Linear', month: 'Linear' },
  Reimbursable: { year: 'Annual', month: 'Linear' },
  Shopping: { year: 'Linear', month: 'Linear' },
  Special: { year: 'Annual', month: 'Linear' },
  Transport: { year: 'Linear', month: 'Linear' },
  'Gift Money': { year: 'Budget', month: 'Average' },
  Income: { year: 'Budget', month: 'Average' },
  Excluded: { year: 'Budget', month: 'Average' },
}

export function getDefaultForecastMethods(category: string): { year: YearMethod; month: MonthMethod } {
  return DEFAULT_METHODS_BY_CATEGORY[category] ?? { year: defaultYearMethod, month: defaultMonthMethod }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const PAGE_SIZE = 1000

const isExpense = (category: string) => !INCOME_CATEGORIES.includes(category)

const toDateOnly = (value: any): string => {
  if (!value) return ''
  if (typeof value === 'string') return value.split('T')[0]
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0]
}

const dayOfYear = (date: Date) => {
  const start = new Date(date.getFullYear(), 0, 0)
  return Math.floor((Number(date) - Number(start)) / MS_PER_DAY)
}

export async function fetchFxRateGBPUSD(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase.from('fx_rate_current').select('gbpusd_rate').limit(1).single()
  const rate = data?.gbpusd_rate
  return rate && rate > 0 ? rate : 1.25
}

/** Build a ForecastSettingRow map from already-fetched data, applying per-category defaults. */
export function buildForecastSettingsMapFromData(
  data: {
    category: string
    current_year_method?: string | null
    current_month_method?: string | null
    manual_year_forecast?: number | null
    manual_month_forecast?: number | null
  }[]
): Map<string, ForecastSettingRow> {
  const map = new Map<string, ForecastSettingRow>()
  for (const row of data) {
    const defaults = getDefaultForecastMethods(row.category)
    map.set(row.category, {
      category: row.category,
      current_year_method: (row.current_year_method as YearMethod) ?? defaults.year,
      current_month_method: (row.current_month_method as MonthMethod) ?? defaults.month,
      manual_year_forecast: row.manual_year_forecast ?? null,
      manual_month_forecast: row.manual_month_forecast ?? null,
    })
  }
  return map
}

/** Return Map<category, { current_year_method, current_month_method }> */
export async function fetchForecastSettingsMap(
  supabase: SupabaseClient,
  userId: string
): Promise<Map<string, ForecastSettingRow>> {
  const { data } = await supabase
    .from('forecast_settings')
    .select('category, current_year_method, current_month_method, manual_year_forecast, manual_month_forecast')
    .eq('user_id', userId)

  const map = new Map<string, ForecastSettingRow>()
  ;(data || []).forEach((row: { category: string; current_year_method?: YearMethod; current_month_method?: MonthMethod; manual_year_forecast?: number | null; manual_month_forecast?: number | null }) => {
    const defaults = getDefaultForecastMethods(row.category)
    map.set(row.category, {
      category: row.category,
      current_year_method: (row.current_year_method as YearMethod) ?? defaults.year,
      current_month_method: (row.current_month_method as MonthMethod) ?? defaults.month,
      manual_year_forecast: row.manual_year_forecast ?? null,
      manual_month_forecast: row.manual_month_forecast ?? null,
    })
  })
  return map
}

/** Union of categories from budgets and forecast settings */
export async function fetchCategories(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const [budgetRes, settingsRes] = await Promise.all([
    supabase.from('budget_targets').select('category').eq('user_id', userId),
    supabase.from('forecast_settings').select('category').eq('user_id', userId),
  ])

  const set = new Set<string>()
  ;(budgetRes.data || []).forEach((row: { category: string }) => row.category && set.add(row.category))
  ;(settingsRes.data || []).forEach((row: { category: string }) => row.category && set.add(row.category))

  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

export async function fetchForecastSettingsRows(
  supabase: SupabaseClient,
  userId: string
): Promise<ForecastSettingRow[]> {
  const [categories, settingsMap] = await Promise.all([
    fetchCategories(supabase, userId),
    fetchForecastSettingsMap(supabase, userId),
  ])

  return categories.map((category) => {
    const existing = settingsMap.get(category)
    const defaults = getDefaultForecastMethods(category)
    return {
      category,
      current_year_method: existing?.current_year_method ?? defaults.year,
      current_month_method: existing?.current_month_method ?? defaults.month,
      manual_year_forecast: existing?.manual_year_forecast ?? null,
      manual_month_forecast: existing?.manual_month_forecast ?? null,
    }
  })
}

const normalizeAmountGBP = (amountGBP: number | null, amountUSD: number | null, gbpUsdRate: number) => {
  if (amountGBP != null && !Number.isNaN(Number(amountGBP))) return Number(amountGBP)
  if (amountUSD != null && !Number.isNaN(Number(amountUSD))) return Number(amountUSD) / gbpUsdRate
  return 0
}

const normalizeManualForecast = (value: number | null | undefined, expense: boolean): number | null => {
  if (value == null || Number.isNaN(Number(value))) return null
  const num = Number(value)
  return expense ? -Math.abs(num) : Math.abs(num)
}

/** Manual forecast with actual floor (same conservative rule as Budget year method). */
function computeManualForecastWithActualFloor(
  manualForecast: number | null | undefined,
  actualValue: number,
  expense: boolean
): number {
  const manual = normalizeManualForecast(manualForecast, expense)
  if (manual == null) return actualValue
  return expense ? Math.min(manual, actualValue) : Math.max(manual, actualValue)
}

export function computeManualYearForecast(
  manualYearForecast: number | null | undefined,
  ytdValue: number,
  expense: boolean
): number {
  return computeManualForecastWithActualFloor(manualYearForecast, ytdValue, expense)
}

export function computeManualMonthForecast(
  manualMonthForecast: number | null | undefined,
  mtdValue: number,
  expense: boolean
): number {
  return computeManualForecastWithActualFloor(manualMonthForecast, mtdValue, expense)
}

export type TxRowForecast = {
  category: string
  date: unknown
  amount_gbp: number | null
  amount_usd: number | null
}

/** Optional preloaded data for daily-summary API to avoid duplicate fetches. transactionRows must be from (currentYear-4)-01-01 through today. */
export type DailySummaryPreloaded = {
  rate: number
  settingsMap: Map<string, ForecastSettingRow>
  budgetRes: { data: { category: string; annual_budget_gbp: number | null }[] | null }
  categories: string[]
  transactionRows: TxRowForecast[]
}

export async function fetchTransactionsPaged(
  supabase: SupabaseClient,
  userId: string,
  startDate: string
): Promise<TxRowForecast[]> {
  const buildQuery = (from: number, to: number) =>
    supabase
      .from('transaction_log')
      .select('category, date, amount_gbp, amount_usd', { count: 'exact' })
      .eq('user_id', userId)
      .gte('date', startDate)
      .order('date', { ascending: true })
      .range(from, to)

  const { data: firstPage, count, error } = await buildQuery(0, PAGE_SIZE - 1)
  if (error) {
    console.error('fetchTransactionsPaged error', error)
    return firstPage ?? []
  }

  const rows = firstPage ?? []
  const total = count ?? rows.length
  const remainingPages = Math.ceil((total - rows.length) / PAGE_SIZE)

  if (remainingPages <= 0) return rows

  const rest = await Promise.all(
    Array.from({ length: remainingPages }, (_, i) =>
      buildQuery((i + 1) * PAGE_SIZE, (i + 2) * PAGE_SIZE - 1).then((r) => r.data ?? [])
    )
  )

  return rows.concat(...rest)
}

export type AnnualForecastEntry = { forecast: number; ytd: number; annualBudget: number }
export type AnnualForecastRecord = Record<string, AnnualForecastEntry>

export async function computeAnnualForecasts(
  supabase: SupabaseClient,
  userId: string,
  preloaded?: DailySummaryPreloaded
): Promise<Map<string, AnnualForecastEntry>> {
  const today = new Date()
  const currentYear = today.getFullYear()
  const startDate = `${currentYear}-01-01`
  const totalDaysInYear = (year: number) => (new Date(year, 1, 29).getMonth() === 1 ? 366 : 365)
  const pctElapsed = Math.min(Math.max(dayOfYear(today) / totalDaysInYear(currentYear), 0), 1)
  const pctRemaining = 1 - pctElapsed

  let rate: number
  let settingsMap: Map<string, ForecastSettingRow>
  let budgetRes: { data: { category: string; annual_budget_gbp: number | null }[] | null }
  let categories: string[]
  let txRes: TxRowForecast[]

  if (preloaded) {
    rate = preloaded.rate
    settingsMap = preloaded.settingsMap
    budgetRes = preloaded.budgetRes
    categories = preloaded.categories
    txRes = preloaded.transactionRows.filter((tx) => {
      const dateStr = toDateOnly(tx.date)
      return dateStr && dateStr.startsWith(String(currentYear))
    })
  } else {
    const [r, s, b, c] = await Promise.all([
      fetchFxRateGBPUSD(supabase),
      fetchForecastSettingsMap(supabase, userId),
      supabase.from('budget_targets').select('category, annual_budget_gbp').eq('user_id', userId),
      fetchCategories(supabase, userId),
    ])
    rate = r
    settingsMap = s
    budgetRes = b
    categories = c
    txRes = await fetchTransactionsPaged(supabase, userId, startDate)
  }

  const ytd = computeExpenseYtdByCategory(txRes || [], {
    year: currentYear,
    asOf: todayLocalDateString(),
    gbpUsdRate: rate,
  })

  const budgetByCategory = new Map<string, number>()
  ;(budgetRes.data || []).forEach((row: { category: string; annual_budget_gbp: number | null }) => {
    budgetByCategory.set(row.category, Number(row.annual_budget_gbp ?? 0))
  })

  const result = new Map<string, AnnualForecastEntry>()
  categories.forEach((category) => {
    const annualBudget = budgetByCategory.get(category) || 0
    const ytdValue = ytd.get(category) || 0
    const settings = settingsMap.get(category)
    const method = settings?.current_year_method || getDefaultForecastMethods(category).year
    const expense = isExpense(category)
    let forecast = ytdValue
    if (method === 'Manual') {
      forecast = computeManualYearForecast(settings?.manual_year_forecast ?? null, ytdValue, expense)
    } else if (method === 'Annual') {
      forecast = ytdValue + annualBudget * pctRemaining
    } else if (method === 'Linear') {
      forecast = pctElapsed > 0 ? ytdValue / pctElapsed : ytdValue
    } else if (method === 'Budget') {
      forecast = expense ? Math.min(annualBudget, ytdValue) : Math.max(annualBudget, ytdValue)
    }

    result.set(category, { forecast, ytd: ytdValue, annualBudget })
  })

  return result
}

export async function computeAnnualTrends(
  supabase: SupabaseClient,
  userId: string,
  preloaded?: DailySummaryPreloaded
): Promise<AnnualTrend[]> {
  const today = new Date()
  const currentYear = today.getFullYear()
  const startDate = `${currentYear - 4}-01-01`
  const totalDaysInYear = (year: number) => (new Date(year, 1, 29).getMonth() === 1 ? 366 : 365)
  const pctYearElapsed = () => dayOfYear(today) / totalDaysInYear(currentYear)

  let rate: number
  let settingsMap: Map<string, ForecastSettingRow>
  let budgetRes: { data: { category: string; annual_budget_gbp: number | null }[] | null }
  let txRes: TxRowForecast[]

  if (preloaded) {
    rate = preloaded.rate
    settingsMap = preloaded.settingsMap
    budgetRes = preloaded.budgetRes
    txRes = preloaded.transactionRows
  } else {
    const [r, s, b] = await Promise.all([
      fetchFxRateGBPUSD(supabase),
      fetchForecastSettingsMap(supabase, userId),
      supabase.from('budget_targets').select('category, annual_budget_gbp').eq('user_id', userId),
    ])
    rate = r
    settingsMap = s
    budgetRes = b
    txRes = await fetchTransactionsPaged(supabase, userId, startDate)
  }

  const budgetByCategory = new Map<string, number>()
  ;(budgetRes.data || []).forEach((row: { category: string; annual_budget_gbp: number | null }) => {
    budgetByCategory.set(row.category, Number(row.annual_budget_gbp ?? 0))
  })

  // category -> year -> sum (GBP)
  const totals = new Map<string, Map<number, number>>()
  // category -> ytd sum
  const ytd = new Map<string, number>()

  ;(txRes || []).forEach((tx: { category: string; date: any; amount_gbp: number | null; amount_usd: number | null }) => {
    if (!tx.category) return
    if (!isExpense(tx.category)) return
    const dateStr = toDateOnly(tx.date)
    if (!dateStr) return
    const year = Number(dateStr.split('-')[0])
    if (Number.isNaN(year)) return
    const amount = normalizeAmountGBP(tx.amount_gbp, tx.amount_usd, rate)
    if (amount === 0) return
    if (!totals.has(tx.category)) totals.set(tx.category, new Map())
    const byYear = totals.get(tx.category)!
    byYear.set(year, (byYear.get(year) || 0) + amount)
    if (year === currentYear && dateStr <= toDateOnly(today)) {
      ytd.set(tx.category, (ytd.get(tx.category) || 0) + amount)
    }
  })

  const categories = preloaded
    ? preloaded.categories.filter(isExpense)
    : (await fetchCategories(supabase, userId)).filter(isExpense)
  const pctElapsed = Math.min(Math.max(pctYearElapsed(), 0), 1)
  const pctRemaining = 1 - pctElapsed

  const rows = categories.map((category) => {
    const byYear = totals.get(category) || new Map()
    const curMinus = (offset: number) => byYear.get(currentYear - offset) || 0
    const ytdValue = ytd.get(category) || 0
    const annualBudget = budgetByCategory.get(category) || 0
    const yearMethod = settingsMap.get(category)?.current_year_method || getDefaultForecastMethods(category).year
    const expense = true
    let curYearEst = ytdValue
    if (yearMethod === 'Manual') {
      curYearEst = computeManualYearForecast(
        settingsMap.get(category)?.manual_year_forecast ?? null,
        ytdValue,
        expense
      )
    } else if (yearMethod === 'Annual') {
      curYearEst = ytdValue + annualBudget * pctRemaining
    } else if (yearMethod === 'Linear') {
      curYearEst = pctElapsed > 0 ? ytdValue / pctElapsed : ytdValue
    } else if (yearMethod === 'Budget') {
      // For expenses (negative), choose the more conservative (more negative) value.
      // For income (positive), use budget unless YTD exceeds it.
      curYearEst = expense ? Math.min(annualBudget, ytdValue) : Math.max(annualBudget, ytdValue)
    }

    const lastFour = [curMinus(1), curMinus(2), curMinus(3), curMinus(4)]
    const nonZero = lastFour.filter((v) => v !== 0)
    const denom = nonZero.length || lastFour.length || 1
    const avg4 = (nonZero.length ? nonZero : lastFour).reduce((s, v) => s + v, 0) / denom

    return {
      id: `${category}-${currentYear}`,
      category,
      cur_yr_minus_4: curMinus(4),
      cur_yr_minus_3: curMinus(3),
      cur_yr_minus_2: curMinus(2),
      cur_yr_minus_1: curMinus(1),
      cur_yr_est: curYearEst,
      cur_yr_est_vs_4yr_avg: curYearEst - avg4,
    }
  })

  return rows.filter((row) => {
    const twoYearAvg = (row.cur_yr_minus_1 + row.cur_yr_minus_2) / 2
    return !(twoYearAvg === 0 && row.cur_yr_est === 0)
  })
}

export async function computeMonthlyTrends(
  supabase: SupabaseClient,
  userId: string,
  preloaded?: DailySummaryPreloaded
): Promise<MonthlyTrend[]> {
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1 // 1-12
  const startDate = new Date(currentYear, currentMonth - 13, 1) // 13 months back (to cover 12 full months + current)
  const startDateStr = toDateOnly(startDate)

  let rate: number
  let settingsMap: Map<string, ForecastSettingRow>
  let txRes: TxRowForecast[]

  if (preloaded) {
    rate = preloaded.rate
    settingsMap = preloaded.settingsMap
    txRes = preloaded.transactionRows.filter((tx) => {
      const dateStr = toDateOnly(tx.date)
      return dateStr && dateStr >= startDateStr
    })
  } else {
    const [r, s] = await Promise.all([
      fetchFxRateGBPUSD(supabase),
      fetchForecastSettingsMap(supabase, userId),
    ])
    rate = r
    settingsMap = s
    txRes = await fetchTransactionsPaged(supabase, userId, startDateStr)
  }

  const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`

  // category -> monthKey -> sum
  const totals = new Map<string, Map<string, number>>()

  ;(txRes || []).forEach((tx: { category: string; date: any; amount_gbp: number | null; amount_usd: number | null }) => {
    if (!tx.category) return
    if (!isExpense(tx.category)) return
    const dateStr = toDateOnly(tx.date)
    if (!dateStr) return
    const [y, m] = dateStr.split('-').map((n) => Number(n))
    if (!y || !m) return
    const amount = normalizeAmountGBP(tx.amount_gbp, tx.amount_usd, rate)
    if (amount === 0) return
    const key = monthKey(y, m)
    if (!totals.has(tx.category)) totals.set(tx.category, new Map())
    const byMonth = totals.get(tx.category)!
    byMonth.set(key, (byMonth.get(key) || 0) + amount)
  })

  const categories = preloaded
    ? preloaded.categories.filter(isExpense)
    : (await fetchCategories(supabase, userId)).filter(isExpense)
  const daysInCurrentMonth = new Date(currentYear, currentMonth, 0).getDate()
  const pctMonthElapsed = today.getDate() / daysInCurrentMonth

  const lastFullMonthsKeys = (n: number) => {
    const keys: string[] = []
    for (let i = 1; i <= n; i++) {
      let m = currentMonth - i
      let y = currentYear
      while (m <= 0) {
        m += 12
        y -= 1
      }
      keys.push(monthKey(y, m))
    }
    return keys
  }

  const full12Keys = lastFullMonthsKeys(12)
  const last3Keys = lastFullMonthsKeys(3)

  const rows = categories.map((category) => {
    const byMonth = totals.get(category) || new Map()
    const getMonthTotal = (key: string) => byMonth.get(key) || 0

    const curMonthKey = monthKey(currentYear, currentMonth)
    const mtd = getMonthTotal(curMonthKey)

    const monthMethod = settingsMap.get(category)?.current_month_method || getDefaultForecastMethods(category).month
    const expense = true

    let curMonthEst = mtd
    if (monthMethod === 'Manual') {
      curMonthEst = computeManualMonthForecast(
        settingsMap.get(category)?.manual_month_forecast ?? null,
        mtd,
        expense
      )
    } else if (monthMethod === 'Average') {
      const values = last3Keys.map(getMonthTotal)
      const available = values.filter((v) => v !== 0)
      const denom = available.length || values.length || 1
      const avg3 = (available.length ? available : values).reduce((s, v) => s + v, 0) / denom
      if (expense) {
        curMonthEst = Math.abs(mtd) > Math.abs(avg3) ? mtd : avg3
      } else {
        curMonthEst = mtd > avg3 ? mtd : avg3
      }
    } else if (monthMethod === 'Linear') {
      curMonthEst = pctMonthElapsed > 0 ? mtd / pctMonthElapsed : mtd
    } else if (monthMethod === 'MTD') {
      curMonthEst = mtd
    }

    // Last 3 full months
    const cur_month_minus_1 = getMonthTotal(last3Keys[0])
    const cur_month_minus_2 = getMonthTotal(last3Keys[1])
    const cur_month_minus_3 = getMonthTotal(last3Keys[2])

    // TTM avg and z-score (exclude current month)
    const ttmValues = full12Keys.map(getMonthTotal)
    const mean = ttmValues.reduce((s, v) => s + v, 0) / (ttmValues.length || 1)
    const variance = ttmValues.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (ttmValues.length || 1)
    const stddev = Math.sqrt(variance)
    const z_score = stddev > 0 ? (curMonthEst - mean) / stddev : 0

    // Ensure signs are consistent (expenses negative). Data already summed; leave as-is.
    const adjust = (value: number) => (expense ? -Math.abs(value) : Math.abs(value))

    return {
      id: `${category}-${curMonthKey}`,
      category,
      cur_month_minus_3: adjust(cur_month_minus_3),
      cur_month_minus_2: adjust(cur_month_minus_2),
      cur_month_minus_1: adjust(cur_month_minus_1),
      cur_month_est: adjust(curMonthEst),
      mtd: adjust(mtd),
      ttm_avg: adjust(mean),
      z_score,
      delta_vs_l3m: adjust(curMonthEst - (cur_month_minus_1 + cur_month_minus_2 + cur_month_minus_3) / 3 || 0),
    }
  })

  return rows.filter((row) => {
    const threeMonthAvg = (row.cur_month_minus_1 + row.cur_month_minus_2 + row.cur_month_minus_3) / 3
    return !(threeMonthAvg === 0 && row.cur_month_est === 0)
  })
}
