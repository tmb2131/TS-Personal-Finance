import { createClient } from '@/lib/supabase/server'
import { IncomeVsExpensesChart, type IncomeVsExpensesChartInitialData } from './income-vs-expenses-chart'

async function fetchIncomeVsExpensesData(): Promise<IncomeVsExpensesChartInitialData> {
  const supabase = await createClient()
  const [budgetsRes, investmentRes] = await Promise.all([
    supabase.from('budget_targets').select('*'),
    supabase.from('investment_return').select('*'),
  ])
  if (budgetsRes.error) {
    throw new Error(budgetsRes.error.message)
  }
  if (investmentRes.error) {
    throw new Error(investmentRes.error.message)
  }
  return {
    budgets: (budgetsRes.data ?? []) as IncomeVsExpensesChartInitialData['budgets'],
    investmentReturns: (investmentRes.data ?? []) as IncomeVsExpensesChartInitialData['investmentReturns'],
  }
}

export async function IncomeVsExpensesChartWrapper() {
  try {
    const initialData = await fetchIncomeVsExpensesData()
    return <IncomeVsExpensesChart initialData={initialData} />
  } catch (error) {
    return (
      <div className="text-sm text-destructive p-4">
        Failed to load income & expenses data. Please try refreshing the page.
      </div>
    )
  }
}
