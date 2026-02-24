import { createClient } from '@/lib/supabase/server'
import { fetchHistoricalNetWorth, fetchBudgetTargets, fetchCurrentUser } from '@/lib/data/cached-queries'
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

  const [nwData, budgetData, user] = await Promise.all([
    fetchHistoricalNetWorth(),
    fetchBudgetTargets(),
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
