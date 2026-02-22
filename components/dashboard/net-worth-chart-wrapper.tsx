import { fetchNetWorthFromAccountBalances } from '@/lib/data/cached-queries'
import { NetWorthChart } from './net-worth-chart'

export async function NetWorthChartWrapper() {
  try {
    const data = await fetchNetWorthFromAccountBalances()
    return <NetWorthChart initialData={data} />
  } catch (error) {
    return (
      <div className="text-sm text-destructive p-4">
        Failed to load net worth data. Please try refreshing the page.
      </div>
    )
  }
}
