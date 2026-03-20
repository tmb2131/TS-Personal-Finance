import { createClient } from '@/lib/supabase/server'
import { fetchBudgetTargets } from '@/lib/data/cached-queries'
import { computeAnnualForecasts } from '@/lib/forecasting'
import { BudgetTable } from './budget-table'

export async function BudgetTableWrapper() {
  try {
    const [data, supabase] = await Promise.all([fetchBudgetTargets(), createClient()])
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const initialAnnualForecasts = user
      ? Object.fromEntries(await computeAnnualForecasts(supabase, user.id))
      : {}
    return <BudgetTable initialData={data} initialAnnualForecasts={initialAnnualForecasts} />
  } catch (error) {
    return (
      <div className="text-sm text-destructive p-4">
        Failed to load budget data. Please try refreshing the page.
      </div>
    )
  }
}
