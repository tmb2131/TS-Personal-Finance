import { fetchYearStartYearEndFromAccountBalances } from '@/lib/data/cached-queries'
import { NetWorthStartEndChart } from './net-worth-start-end-chart'

export async function NetWorthStartEndChartWrapper() {
  const yearStartYearEnd = await fetchYearStartYearEndFromAccountBalances()
  return <NetWorthStartEndChart initialData={yearStartYearEnd} />
}
