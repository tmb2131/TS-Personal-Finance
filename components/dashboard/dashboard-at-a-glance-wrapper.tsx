import { createClient } from '@/lib/supabase/server'
import {
  fetchHistoricalNetWorth,
  fetchLatestNetWorthFromAccountBalances,
  fetchBudgetTargets,
  fetchCurrentUser,
} from '@/lib/data/cached-queries'
import { computeAnnualForecasts, computeMonthlyTrends } from '@/lib/forecasting'
import { isExcludedCategory } from '@/lib/category-filters'
import { DashboardAtAGlance, type DashboardAtAGlanceData } from './dashboard-at-a-glance'

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

  const [nwData, latestSnapshot, budgetData, user] = await Promise.all([
    fetchHistoricalNetWorth(),
    fetchLatestNetWorthFromAccountBalances(),
    fetchBudgetTargets(),
    fetchCurrentUser(),
  ])

  // Net worth: prefer live snapshot from account_balances (matches Net Worth Over Time chart).
  // Otherwise use latest snapshot per category from historical_net_worth for the latest year (do not sum all rows).
  let netWorthGbp: number | null = null
  let netWorthUsd: number | null = null
  let hasTrustData = false

  if (latestSnapshot) {
    netWorthGbp =
      (latestSnapshot.Personal?.amount_gbp ?? 0) +
      (latestSnapshot.Family?.amount_gbp ?? 0) +
      (latestSnapshot.Trust?.amount_gbp ?? 0)
    netWorthUsd =
      (latestSnapshot.Personal?.amount_usd ?? 0) +
      (latestSnapshot.Family?.amount_usd ?? 0) +
      (latestSnapshot.Trust?.amount_usd ?? 0)
    hasTrustData =
      Math.abs(latestSnapshot.Trust?.amount_gbp ?? 0) > 0 ||
      Math.abs(latestSnapshot.Trust?.amount_usd ?? 0) > 0
  } else if (nwData.length) {
    // Fallback: latest value per (year, category), then sum for latest year only (one snapshot, not all rows).
    const latestByYearCategory = new Map<
      string,
      { date: string; amount_gbp: number; amount_usd: number }
    >()
    const currentYear = new Date().getFullYear()
    nwData.forEach((item) => {
      const year = new Date(item.date).getFullYear()
      const category =
        item.category === 'Personal' || item.category === 'Family' || item.category === 'Trust'
          ? item.category
          : null
      if (!category) return
      const dateKey = item.date?.slice(0, 10) ?? ''
      const key = `${year}|${category}`
      const existing = latestByYearCategory.get(key)
      if (!existing || dateKey > existing.date) {
        latestByYearCategory.set(key, {
          date: dateKey,
          amount_gbp: item.amount_gbp ?? 0,
          amount_usd: item.amount_usd ?? 0,
        })
      }
    })
    const byYearGbp: Record<number, number> = {}
    const byYearUsd: Record<number, number> = {}
    latestByYearCategory.forEach((val, k) => {
      const year = Number(k.split('|')[0])
      byYearGbp[year] = (byYearGbp[year] ?? 0) + val.amount_gbp
      byYearUsd[year] = (byYearUsd[year] ?? 0) + val.amount_usd
    })
    const latestYear = Math.max(...Object.keys(byYearGbp).map(Number), currentYear)
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

  // Monthly trends: aggregate cur_month_est and mtd for summary card (expenses are negative)
  let monthlyEstGbp: number | null = null
  let monthlyMtdGbp: number | null = null
  if (user) {
    const monthlyTrends = await computeMonthlyTrends(supabase, user.id)
    monthlyEstGbp = monthlyTrends.reduce((sum, row) => sum + row.cur_month_est, 0)
    monthlyMtdGbp = monthlyTrends.reduce((sum, row) => sum + row.mtd, 0)
  }

  return {
    netWorthGbp,
    netWorthUsd,
    hasTrustData,
    incomeForecastGbp,
    expensesForecastGbp,
    incomeBudgetGbp,
    expensesBudgetGbp,
    monthlyEstGbp,
    monthlyMtdGbp,
  }
}
