import { createClient } from '@/lib/supabase/server'
import { fetchHistoricalNetWorth, fetchBudgetTargets, fetchCurrentUser } from '@/lib/data/cached-queries'
import { computeAnnualForecasts, getDefaultForecastMethods } from '@/lib/forecasting'
import { isExcludedCategory, isExpenseCategory } from '@/lib/category-filters'
import { computeForecastNeutralDailyBudget } from '@/lib/forecast-neutral-daily-budget'
import { DashboardAtAGlance, type DashboardAtAGlanceData } from './dashboard-at-a-glance'

type ForecastSettingsRow = {
  category: string
  current_year_method: 'Annual' | 'Linear' | 'Budget' | 'Manual' | null
  manual_year_forecast: number | null
}

type TransactionForDayRow = {
  date: string
  category: string
  amount_gbp: number | null
  amount_usd: number | null
}

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

function inferSpendDirection(
  annualBudget: number,
  ytdYesterday: number,
  todaySpend: number,
  fallbackDirection: 1 | -1
): 1 | -1 {
  const candidates = [annualBudget, ytdYesterday, todaySpend]
  for (const value of candidates) {
    if (Math.abs(value) > 1e-9) return value >= 0 ? 1 : -1
  }
  return fallbackDirection
}

export async function DashboardAtAGlanceWrapper() {
  try {
    const data = await fetchDashboardSummary()
    return <DashboardAtAGlance data={data} />
  } catch (error) {
    // Fall back to client-only mode on error
    return <DashboardAtAGlance data={null} />
  }
}

async function fetchDashboardSummary(): Promise<DashboardAtAGlanceData> {
  const supabase = await createClient()
  const today = new Date()
  const localTodayStr = toLocalDateString(today)
  const utcTodayStr = today.toISOString().split('T')[0]
  const todayDateCandidates = Array.from(new Set([localTodayStr, utcTodayStr]))

  const [nwData, budgetData, settingsRes, todayTxRes, user] = await Promise.all([
    fetchHistoricalNetWorth(),
    fetchBudgetTargets(),
    supabase.from('forecast_settings').select('category, current_year_method, manual_year_forecast'),
    supabase.from('transaction_log').select('date, category, amount_gbp, amount_usd').in('date', todayDateCandidates),
    fetchCurrentUser(),
  ])

  // Net worth: aggregate by year, take latest year
  let netWorthGbp: number | null = null
  let netWorthUsd: number | null = null
  let hasTrustData = false
  if (nwData.length) {
    const byYearGbp: Record<number, number> = {}
    const byYearUsd: Record<number, number> = {}
    nwData.forEach((item) => {
      const year = new Date(item.date).getFullYear()
      byYearGbp[year] = (byYearGbp[year] ?? 0) + (item.amount_gbp ?? 0)
      byYearUsd[year] = (byYearUsd[year] ?? 0) + (item.amount_usd ?? 0)
    })
    const latestYear = Math.max(...Object.keys(byYearGbp).map(Number))
    netWorthGbp = byYearGbp[latestYear] ?? null
    netWorthUsd = byYearUsd[latestYear] ?? null
    hasTrustData = nwData.some(
      (item) => item.category === 'Trust' && (Math.abs(item.amount_gbp ?? 0) > 0 || Math.abs(item.amount_usd ?? 0) > 0)
    )
  }

  // Compute annual forecasts (GBP-based, the expensive part)
  const forecasts = user ? await computeAnnualForecasts(supabase, user.id) : null

  // Budget income/expenses (in GBP, client converts)
  let incomeForecastGbp = 0
  let expensesForecastGbp = 0
  let incomeBudgetGbp = 0
  let expensesBudgetGbp = 0
  if (budgetData.length) {
    budgetData.forEach((row) => {
      if (isExcludedCategory(row.category)) return
      const forecast = forecasts?.get(row.category)?.forecast ?? row.annual_budget_gbp
      const budget = row.annual_budget_gbp
      if (row.category === 'Income' || row.category === 'Gift Money') {
        incomeForecastGbp += Math.abs(forecast)
        incomeBudgetGbp += Math.abs(budget)
      } else {
        expensesForecastGbp += Math.abs(forecast)
        expensesBudgetGbp += Math.abs(budget)
      }
    })
  }

  // Daily neutral budget computation (GBP)
  let dailyNeutralBudgetGbp: number | null = null
  let dailyUsedBudgetGbp: number | null = null
  let dailyUsedPercent: number | null = null
  let dailyForecastDirection: 'improving' | 'worsening' | 'flat' | null = null

  if (forecasts && user) {
    const settingsByCategory = new Map<string, ForecastSettingsRow>()
    ;((settingsRes.data || []) as ForecastSettingsRow[]).forEach((row) => {
      if (!row.category) return
      settingsByCategory.set(row.category, row)
    })

    const txRows = (todayTxRes.data || []) as TransactionForDayRow[]
    const txRowsByDate = new Map<string, TransactionForDayRow[]>()
    txRows.forEach((row) => {
      const dateKey = String(row.date || '')
      if (!dateKey) return
      const list = txRowsByDate.get(dateKey) ?? []
      list.push(row)
      txRowsByDate.set(dateKey, list)
    })

    const effectiveTodayRows =
      (txRowsByDate.get(localTodayStr)?.length ?? 0) > 0
        ? txRowsByDate.get(localTodayStr) || []
        : txRowsByDate.get(utcTodayStr) || []

    const todaySpendByCategory = new Map<string, number>()
    const effectiveRate = 1.27 // server-side default GBP rate
    effectiveTodayRows.forEach((row) => {
      if (!row.category || !isExpenseCategory(row.category)) return
      const amountGbp =
        row.amount_gbp != null
          ? toNumber(row.amount_gbp)
          : row.amount_usd != null
            ? toNumber(row.amount_usd) / effectiveRate
            : 0
      if (!Number.isFinite(amountGbp) || amountGbp === 0) return
      todaySpendByCategory.set(row.category, (todaySpendByCategory.get(row.category) ?? 0) + amountGbp)
    })

    const dayOfYear = getDayOfYear(today)
    const daysInYear = getDaysInYear(today.getFullYear())

    const categoryBaseRows = Array.from(forecasts.entries())
      .filter(([category]) => isExpenseCategory(category))
      .map(([category, values]) => {
        const todaySpend = todaySpendByCategory.get(category) ?? 0
        const ytdYesterday = values.ytd - todaySpend
        const settingsRow = settingsByCategory.get(category)
        const method = settingsRow?.current_year_method ?? getDefaultForecastMethods(category).year
        return {
          category,
          annualBudget: values.annualBudget,
          ytdYesterday,
          method,
          manualYearForecast: settingsRow?.manual_year_forecast ?? null,
          todaySpend,
        }
      })

    const directionScore = categoryBaseRows.reduce((sum, row) => {
      const anchor = Math.abs(row.annualBudget) > 1e-9 ? row.annualBudget : row.ytdYesterday
      if (Math.abs(anchor) <= 1e-9) return sum
      return sum + Math.sign(anchor) * Math.abs(anchor)
    }, 0)
    const globalDirection: 1 | -1 = directionScore > 0 ? 1 : -1

    const neutralCategories = categoryBaseRows.map((row) => ({
      category: row.category,
      annualBudget: row.annualBudget,
      ytdYesterday: row.ytdYesterday,
      method: row.method,
      manualYearForecast: row.manualYearForecast,
      spendDirection: inferSpendDirection(row.annualBudget, row.ytdYesterday, row.todaySpend, globalDirection),
    }))

    const spendWeightByCategory = new Map<string, number>()
    let hasPositiveWeights = false
    neutralCategories.forEach((row) => {
      const todaySpend = (todaySpendByCategory.get(row.category) ?? 0) * row.spendDirection
      if (todaySpend > 0) {
        spendWeightByCategory.set(row.category, todaySpend)
        hasPositiveWeights = true
      }
    })

    if (!hasPositiveWeights) {
      neutralCategories.forEach((row) => {
        const weight = Math.abs(row.annualBudget)
        if (weight > 0) {
          spendWeightByCategory.set(row.category, weight)
          hasPositiveWeights = true
        }
      })
    }

    if (!hasPositiveWeights) {
      neutralCategories.forEach((row) => {
        const weight = Math.abs(row.ytdYesterday)
        if (weight > 0) {
          spendWeightByCategory.set(row.category, weight)
        }
      })
    }

    const neutralResult = computeForecastNeutralDailyBudget({
      dayOfYear,
      daysInYear,
      categories: neutralCategories,
      todaySpendByCategory,
      spendWeightByCategory,
    })

    dailyNeutralBudgetGbp = neutralResult.neutralSpend != null ? Math.max(0, neutralResult.neutralSpend) : null
    dailyUsedBudgetGbp = neutralResult.usedSpend
    dailyUsedPercent = neutralResult.usedPercent
    if (neutralResult.deltaAtUsed < -0.5) dailyForecastDirection = 'improving'
    else if (neutralResult.deltaAtUsed > 0.5) dailyForecastDirection = 'worsening'
    else dailyForecastDirection = 'flat'
  }

  return {
    netWorthGbp,
    netWorthUsd,
    hasTrustData,
    incomeForecastGbp,
    expensesForecastGbp,
    incomeBudgetGbp,
    expensesBudgetGbp,
    dailyNeutralBudgetGbp,
    dailyUsedBudgetGbp,
    dailyUsedPercent,
    dailyForecastDirection,
  }
}
