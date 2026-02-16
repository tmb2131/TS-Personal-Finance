import { fetchBudgetTargets, fetchInvestmentReturns } from '@/lib/data/cached-queries'
import { IncomeVsExpensesChart, type IncomeVsExpensesChartInitialData } from './income-vs-expenses-chart'

export async function IncomeVsExpensesChartWrapper() {
  try {
    const [budgets, investmentReturns] = await Promise.all([
      fetchBudgetTargets(),
      fetchInvestmentReturns(),
    ])
    const initialData: IncomeVsExpensesChartInitialData = {
      budgets: budgets as IncomeVsExpensesChartInitialData['budgets'],
      investmentReturns: investmentReturns as IncomeVsExpensesChartInitialData['investmentReturns'],
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
