import { createClient } from '@/lib/supabase/server'
import { BudgetTable } from './budget-table'
import { BudgetTarget } from '@/lib/types'

async function fetchBudgetData() {
  const supabase = await createClient()
  
  const { data, error } = await supabase.from('budget_targets').select('*')

  if (error) {
    console.error('Error fetching budget data:', error)
    throw new Error('Failed to load budget data')
  }

  return data as BudgetTarget[]
}

export async function BudgetTableWrapper() {
  try {
    const data = await fetchBudgetData()
    return <BudgetTable initialData={data} />
  } catch (error) {
    return (
      <div className="text-sm text-destructive p-4">
        Failed to load budget data. Please try refreshing the page.
      </div>
    )
  }
}
