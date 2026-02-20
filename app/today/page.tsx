import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { computeAnnualForecasts, getDefaultForecastMethods } from '@/lib/forecasting'
import { isExpenseCategory } from '@/lib/category-filters'
import { computeTodayHeadroom, type YearMethod } from '@/lib/today-headroom'
import type { TodayPageData, TodayTransactionRow } from '@/lib/today-types'
import { TodayPageContent } from '@/components/today/today-page-content'

function toLocalDateString(value: Date): string {
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

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

async function fetchTodayData(): Promise<TodayPageData | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const today = new Date()
  const localTodayStr = toLocalDateString(today)
  const utcTodayStr = today.toISOString().split('T')[0]
  const todayDateCandidates = Array.from(new Set([localTodayStr, utcTodayStr]))

  const [todayTxRes, settingsRes, budgetRes, fxRes, forecasts] = await Promise.all([
    supabase
      .from('transaction_log')
      .select('id, date, category, counterparty, amount_gbp, amount_usd')
      .in('date', todayDateCandidates),
    supabase.from('forecast_settings').select('category, current_year_method, manual_year_forecast'),
    supabase.from('budget_targets').select('category, annual_budget_gbp'),
    supabase.from('fx_rate_current').select('gbpusd_rate').limit(1).single(),
    computeAnnualForecasts(supabase, user.id),
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

  const todaySpendByCategory = new Map<string, number>()
  const expenseTransactions: TodayTransactionRow[] = []
  effectiveTodayRows.forEach((row) => {
    if (!row.category || !isExpenseCategory(row.category)) return
    const amountGbp =
      row.amount_gbp != null
        ? toNumber(row.amount_gbp)
        : row.amount_usd != null
          ? toNumber(row.amount_usd) / fxRate
          : 0
    if (!Number.isFinite(amountGbp)) return
    // Raw sum so refunds (positive) offset expenses (negative)
    todaySpendByCategory.set(row.category, (todaySpendByCategory.get(row.category) ?? 0) + amountGbp)
    if (amountGbp === 0) return
    expenseTransactions.push({
      id: row.id,
      date: row.date,
      category: row.category,
      counterparty: row.counterparty,
      amount_gbp: row.amount_gbp,
      amount_usd: row.amount_usd,
    })
  })

  const settingsByCategory = new Map<string, { current_year_method: YearMethod | null; manual_year_forecast: number | null }>()
  ;((settingsRes.data || []) as Array<{ category: string; current_year_method: YearMethod | null; manual_year_forecast: number | null }>).forEach((row) => {
    if (!row.category) return
    settingsByCategory.set(row.category, {
      current_year_method: row.current_year_method ?? null,
      manual_year_forecast: row.manual_year_forecast ?? null,
    })
  })
  const budgetByCategory = new Map<string, number>()
  ;(budgetRes.data || []).forEach((row: { category: string; annual_budget_gbp: number | null }) => {
    if (row.category) budgetByCategory.set(row.category, Number(row.annual_budget_gbp ?? 0))
  })

  // Display spend = net expense as positive (refunds reduce or zero it)
  const spendByCategory: Record<string, number> = {}
  todaySpendByCategory.forEach((rawSum, k) => {
    spendByCategory[k] = Math.max(0, -rawSum)
  })

  const spendByMethodology: Record<string, number> = { Annual: 0, Budget: 0, Linear: 0, Manual: 0 }
  todaySpendByCategory.forEach((rawSum, category) => {
    const netExpense = Math.max(0, -rawSum)
    const settings = settingsByCategory.get(category)
    const method = (settings?.current_year_method ?? getDefaultForecastMethods(category).year) as YearMethod
    spendByMethodology[method] = (spendByMethodology[method] ?? 0) + netExpense
  })

  const dayOfYear = getDayOfYear(today)
  const daysInYear = getDaysInYear(today.getFullYear())
  const expenseCategories = Array.from(forecasts.keys()).filter((c) => isExpenseCategory(c))
  const headroomCategories = expenseCategories.map((category) => {
    const values = forecasts.get(category)!
    const todaySpend = todaySpendByCategory.get(category) ?? 0
    const settings = settingsByCategory.get(category)
    const method = (settings?.current_year_method ?? getDefaultForecastMethods(category).year) as YearMethod
    return {
      category,
      annualBudget: values.annualBudget,
      ytdYesterday: values.ytd - todaySpend,
      method,
      manualYearForecast: settings?.manual_year_forecast ?? null,
    }
  })

  const {
    headroomByMethodology: headroomMap,
    totalForecastToday,
    totalForecastTomorrowAtZero,
  } = computeTodayHeadroom({
    dayOfYear,
    daysInYear,
    todaySpendByCategory,
    categories: headroomCategories,
  })
  const headroomByMethodology: Record<string, number | null> = {}
  ;(['Annual', 'Budget', 'Linear', 'Manual'] as const).forEach((m) => {
    headroomByMethodology[m] = headroomMap.get(m) ?? null
  })
  const impliedForecastChange =
    Number.isFinite(totalForecastToday) && Number.isFinite(totalForecastTomorrowAtZero)
      ? totalForecastTomorrowAtZero - totalForecastToday
      : null

  const budgetSumByMethodology: Record<string, number> = { Annual: 0, Budget: 0, Linear: 0, Manual: 0 }
  headroomCategories.forEach((row) => {
    const m = row.method
    budgetSumByMethodology[m] = (budgetSumByMethodology[m] ?? 0) + row.annualBudget
  })

  return {
    transactions: expenseTransactions,
    spendByCategory,
    spendByMethodology,
    headroomByMethodology,
    budgetSumByMethodology,
    impliedForecastChange,
    totalForecastToday,
    totalForecastTomorrowAtZero,
  }
}

export default async function TodayPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const data = await fetchTodayData()

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="rounded-xl border border-l-[3px] border-l-slate-500 bg-gradient-to-r from-muted/50 to-muted/30 p-4 md:p-5">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold">Today</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Today&apos;s expenses: transactions, spend by category, and by forecast methodology
          </p>
        </div>
      </div>
      <TodayPageContent data={data} />
    </div>
  )
}
