import { createClient } from '@/lib/supabase/server'
import { MonthlyTrendsTable } from './monthly-trends-table'
import { MonthlyTrend } from '@/lib/types'

async function fetchMonthlyTrendsData() {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('monthly_trends')
    .select('*')
    .order('category')

  if (error) {
    console.error('Error fetching monthly trends:', error)
    throw new Error('Failed to load monthly trends data')
  }

  return data as MonthlyTrend[]
}

export async function MonthlyTrendsTableWrapper() {
  try {
    const data = await fetchMonthlyTrendsData()
    return <MonthlyTrendsTable initialData={data} />
  } catch (error) {
    return (
      <div className="text-sm text-destructive p-4">
        Failed to load monthly trends data. Please try refreshing the page.
      </div>
    )
  }
}
