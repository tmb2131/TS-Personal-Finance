import { fetchBudgetTargets } from '@/lib/data/cached-queries'
import { BudgetTable } from './budget-table'

export async function BudgetTableWrapper() {
  try {
    const data = await fetchBudgetTargets()
    return <BudgetTable initialData={data} />
  } catch (error) {
    return (
      <div className="text-sm text-destructive p-4">
        Failed to load budget data. Please try refreshing the page.
      </div>
    )
  }
}
