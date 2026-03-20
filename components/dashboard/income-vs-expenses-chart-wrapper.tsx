import { createClient } from '@/lib/supabase/server'
import { fetchBudgetTargets, fetchInvestmentReturns } from '@/lib/data/cached-queries'
import { computeAnnualForecasts } from '@/lib/forecasting'
import { IncomeVsExpensesChart, type IncomeVsExpensesChartInitialData } from './income-vs-expenses-chart'

export async function IncomeVsExpensesChartWrapper() {
  try {
    const [budgets, investmentReturns, supabase] = await Promise.all([
      fetchBudgetTargets(),
      fetchInvestmentReturns(),
      createClient(),
    ])
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const initialAnnualForecasts = user
      ? Object.fromEntries(await computeAnnualForecasts(supabase, user.id))
      : {}
    const initialData: IncomeVsExpensesChartInitialData = {
      budgets: budgets as IncomeVsExpensesChartInitialData['budgets'],
      investmentReturns: investmentReturns as IncomeVsExpensesChartInitialData['investmentReturns'],
      initialAnnualForecasts,
    }
    return <IncomeVsExpensesChart initialData={initialData} />
  } catch (error) {
    return (
      <div className="text-sm text-destructive p-4">
        Failed to load income & expenses data. Please try refreshing the page.
      </div>
    )
  }
}
