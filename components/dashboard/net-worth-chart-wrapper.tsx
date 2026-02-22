import { fetchHistoricalNetWorth, fetchLatestNetWorthFromAccountBalances } from '@/lib/data/cached-queries'
import { NetWorthChart } from './net-worth-chart'

export async function NetWorthChartWrapper() {
  try {
    const [data, currentYearFromAccounts] = await Promise.all([
      fetchHistoricalNetWorth(),
      fetchLatestNetWorthFromAccountBalances(),
    ])
    return (
      <NetWorthChart
        initialData={data}
        currentYearFromAccounts={currentYearFromAccounts}
      />
    )
  } catch (error) {
    return (
      <div className="text-sm text-destructive p-4">
        Failed to load net worth data. Please try refreshing the page.
      </div>
    )
  }
}
