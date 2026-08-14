/**
 * Data layer for the Today section.
 *
 * Lifted out of the retired `/today` route when Today became a section of
 * /spending; the computation is unchanged.
 */
import { createClient } from '@/lib/supabase/server'
import {
  computeAnnualForecasts,
  fetchTransactionsPaged,
  getDefaultForecastMethods,
} from '@/lib/forecasting'
import { isExpenseCategory } from '@/lib/category-filters'
import { computeTodayHeadroom, type YearMethod } from '@/lib/today-headroom'
import { computeMonthToDate } from '@/lib/month-to-date'
import type { TodayPageData, TodayTransactionRow } from '@/lib/today-types'
import { computeForecastSnapshotsForDates } from '@/lib/forecast-evolution'
import type { SnapshotPreloaded } from '@/lib/forecast-evolution'
import { toDateOnly } from '@/lib/daily-summary-utils'
import {
  addCalendarDays,
  buildTodaySpendByCategoryFromRows,
  computeImpliedForecastChangeIfNoMoreSpend,
  computeStartOfDayExpenseGap,
  computeTomorrowAtZeroExpenseForecast,
  sumExpenseForecastFromSnapshot,
  sumExpenseGapFromSnapshot,
} from '@/lib/daily-today-metrics'

function toLocalDateStringFromDate(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDayOfYear(value: Date): number {
  const start = new Date(value.getFullYear(), 0, 0)
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.floor((Number(value) - Number(start)) / msPerDay)
}

function getDaysInYear(year: number): number {
  return new Date(year, 1, 29).getMonth() === 1 ? 366 : 365
}

export async function fetchTodayData(): Promise<TodayPageData | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const today = new Date()
  const localTodayStr = toLocalDateStringFromDate(today)
  const localYesterdayStr = addCalendarDays(localTodayStr, -1)
  const utcTodayStr = today.toISOString().split('T')[0]
  const todayDateCandidates = Array.from(new Set([localTodayStr, utcTodayStr]))
  const currentYear = today.getFullYear()
  const txStartDate = `${currentYear - 4}-01-01`

  const [todayTxRes, settingsRes, budgetRes, fxRes, forecasts, transactionRows] =
    await Promise.all([
      supabase
        .from('transaction_log')
        .select('id, date, category, counterparty, amount_gbp, amount_usd')
        .in('date', todayDateCandidates),
      supabase.from('forecast_settings').select('category, current_year_method, manual_year_forecast'),
      supabase.from('budget_targets').select('category, annual_budget_gbp'),
      // One row per day; ordering keeps this in step with every other surface.
      supabase
        .from('fx_rate_current')
        .select('gbpusd_rate')
        .order('date', { ascending: false })
        .limit(1)
        .single(),
      computeAnnualForecasts(supabase, user.id),
      fetchTransactionsPaged(supabase, user.id, txStartDate),
    ])

  const txRows = (todayTxRes.data || []) as Array<{
    id: string
    date: string
    category: string
    counterparty: string | null
    amount_gbp: number | null
    amount_usd: number | null
  }>
  const fxRate = fxRes.data?.gbpusd_rate && fxRes.data.gbpusd_rate > 0 ? fxRes.data.gbpusd_rate : 1.27

  const txRowsByDate = new Map<string, typeof txRows>()
  txRows.forEach((row) => {
    const dateKey = String(row.date || '').split('T')[0]
    if (!dateKey) return
    const list = txRowsByDate.get(dateKey) ?? []
    list.push(row)
    txRowsByDate.set(dateKey, list)
  })
  const effectiveTodayRows =
    (txRowsByDate.get(localTodayStr)?.length ?? 0) > 0
      ? txRowsByDate.get(localTodayStr)!
      : txRowsByDate.get(utcTodayStr) ?? []

  const todaySpendByCategory = buildTodaySpendByCategoryFromRows(
    effectiveTodayRows,
    fxRate,
    isExpenseCategory
  )

  const expenseTransactions: TodayTransactionRow[] = []
  effectiveTodayRows.forEach((row) => {
    if (!row.category || !isExpenseCategory(row.category)) return
    const amountGbp =
      row.amount_gbp != null
        ? Number(row.amount_gbp)
        : row.amount_usd != null
          ? Number(row.amount_usd) / fxRate
          : 0
    if (!Number.isFinite(amountGbp) || amountGbp === 0) return
    expenseTransactions.push({
      id: row.id,
      date: row.date,
      category: row.category,
      counterparty: row.counterparty,
      amount_gbp: row.amount_gbp,
      amount_usd: row.amount_usd,
    })
  })

  const settingsByCategory = new Map<
    string,
    { current_year_method: YearMethod | null; manual_year_forecast: number | null }
  >()
  ;(
    (settingsRes.data || []) as Array<{
      category: string
      current_year_method: YearMethod | null
      manual_year_forecast: number | null
    }>
  ).forEach((row) => {
    if (!row.category) return
    settingsByCategory.set(row.category, {
      current_year_method: row.current_year_method ?? null,
      manual_year_forecast: row.manual_year_forecast ?? null,
    })
  })

  const spendByCategory: Record<string, number> = {}
  todaySpendByCategory.forEach((rawSum, k) => {
    spendByCategory[k] = Math.max(0, -rawSum)
  })

  const spendByMethodology: Record<string, number> = { Annual: 0, Budget: 0, Linear: 0, Manual: 0 }
  const categoriesByMethodology: Record<string, string[]> = {
    Annual: [],
    Budget: [],
    Linear: [],
    Manual: [],
  }
  todaySpendByCategory.forEach((rawSum, category) => {
    const netExpense = Math.max(0, -rawSum)
    const settings = settingsByCategory.get(category)
    const method = (settings?.current_year_method ??
      getDefaultForecastMethods(category).year) as YearMethod
    spendByMethodology[method] = (spendByMethodology[method] ?? 0) + netExpense
    if (!categoriesByMethodology[method].includes(category)) {
      categoriesByMethodology[method].push(category)
    }
  })

  const snapshotPreloaded: SnapshotPreloaded = {
    fxRate,
    settingsData: (settingsRes.data ?? []).map((r) => ({
      category: r.category,
      current_year_method: r.current_year_method ?? null,
      manual_year_forecast: r.manual_year_forecast ?? null,
    })),
    budgetsData: budgetRes.data ?? [],
  }
  const snapshotMinYearStart = `${localYesterdayStr.split('-')[0]}-01-01`
  const snapshotMaxDate = localTodayStr > utcTodayStr ? localTodayStr : utcTodayStr
  const snapshotTxRows = (transactionRows ?? [])
    .map((row) => {
      const date = toDateOnly(row.date)
      if (!date || date < snapshotMinYearStart || date > snapshotMaxDate) return null
      return {
        category: row.category,
        date,
        amount_gbp: row.amount_gbp ?? null,
        amount_usd: row.amount_usd ?? null,
      }
    })
    .filter(
      (
        row
      ): row is {
        category: string
        date: string
        amount_gbp: number | null
        amount_usd: number | null
      } => row !== null
    )

  const snapshots = await computeForecastSnapshotsForDates(
    supabase,
    user.id,
    [localYesterdayStr, localTodayStr],
    snapshotTxRows,
    snapshotPreloaded
  )
  const todaySnapshot = snapshots.get(localTodayStr) ?? new Map()
  const yesterdaySnapshot = snapshots.get(localYesterdayStr) ?? new Map()

  const dayOfYear = getDayOfYear(today)
  const daysInYear = getDaysInYear(today.getFullYear())
  const expenseCategories = Array.from(forecasts.keys()).filter((c) => isExpenseCategory(c))
  const headroomCategories = expenseCategories.map((category) => {
    const values = forecasts.get(category)!
    const todaySpend = todaySpendByCategory.get(category) ?? 0
    const settings = settingsByCategory.get(category)
    const method = (settings?.current_year_method ??
      getDefaultForecastMethods(category).year) as YearMethod
    return {
      category,
      annualBudget: values.annualBudget,
      ytdYesterday: values.ytd - todaySpend,
      method,
      manualYearForecast: settings?.manual_year_forecast ?? null,
    }
  })

  const { headroomByMethodology: headroomMap } = computeTodayHeadroom({
    dayOfYear,
    daysInYear,
    todaySpendByCategory,
    categories: headroomCategories,
  })
  const headroomByMethodology: Record<string, number | null> = {}
  ;(['Annual', 'Budget', 'Linear', 'Manual'] as const).forEach((m) => {
    headroomByMethodology[m] = headroomMap.get(m) ?? null
  })

  const impliedForecastChange = computeImpliedForecastChangeIfNoMoreSpend(
    todaySnapshot,
    yesterdaySnapshot
  )
  const totalForecastTomorrowAtZero = computeTomorrowAtZeroExpenseForecast(
    todaySnapshot,
    addCalendarDays(localTodayStr, 1)
  )
  const totalForecastAtCurrentYtd = sumExpenseForecastFromSnapshot(todaySnapshot)
  const totalForecastEndOfYesterday = sumExpenseForecastFromSnapshot(yesterdaySnapshot)

  const budgetSumByMethodology: Record<string, number> = { Annual: 0, Budget: 0, Linear: 0, Manual: 0 }
  headroomCategories.forEach((row) => {
    const m = row.method
    budgetSumByMethodology[m] = (budgetSumByMethodology[m] ?? 0) + row.annualBudget
  })

  const totalSpentToday = Object.values(spendByCategory).reduce((sum, v) => sum + v, 0)

  // Lead figure: month to date against what this month normally costs. The
  // annual forecast comes from the same snapshot the rest of this page reads,
  // so the two cannot disagree.
  const monthToDate = computeMonthToDate({
    transactions: transactionRows ?? [],
    annualForecastSpend: Math.abs(totalForecastAtCurrentYtd ?? 0),
    gbpUsdRate: fxRate,
    asOf: localTodayStr,
  })
  const gapToBudgetCurrent = computeStartOfDayExpenseGap(
    todaySnapshot,
    localTodayStr,
    todaySpendByCategory
  )
  const gapToBudgetIfNoMoreSpend = sumExpenseGapFromSnapshot(todaySnapshot)

  return {
    transactions: expenseTransactions,
    spendByCategory,
    spendByMethodology,
    headroomByMethodology,
    budgetSumByMethodology,
    impliedForecastChange,
    totalForecastAtCurrentYtd,
    totalForecastEndOfYesterday,
    totalForecastTomorrowAtZero,
    categoriesByMethodology,
    totalSpentToday,
    expensesBudgetTotal: headroomCategories.reduce(
      (sum, row) => sum + Math.abs(row.annualBudget),
      0
    ),
    gapToBudgetCurrent,
    gapToBudgetIfNoMoreSpend,
    monthToDate,
  }
}
