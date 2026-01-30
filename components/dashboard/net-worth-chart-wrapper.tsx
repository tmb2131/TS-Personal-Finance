import { createClient } from '@/lib/supabase/server'
import { NetWorthChart } from './net-worth-chart'
import { HistoricalNetWorth } from '@/lib/types'

async function fetchNetWorthData() {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('historical_net_worth')
    .select('*')
    .order('date', { ascending: true }) // Match the component's expectation

  if (error) {
    console.error('Error fetching net worth data:', error)
    throw new Error('Failed to load net worth data')
  }

  return data as HistoricalNetWorth[]
}

export async function NetWorthChartWrapper() {
  try {
    const data = await fetchNetWorthData()
    return <NetWorthChart initialData={data} />
  } catch (error) {
    return (
      <div className="text-sm text-destructive p-4">
        Failed to load net worth data. Please try refreshing the page.
      </div>
    )
  }
}
