import { fetchTransactionForecast } from '@/lib/data/forecast-transaction-data'
import { ForecastPageClient } from './forecast-page-client'

export async function ForecastPageWrapper() {
  const initial = await fetchTransactionForecast()
  return <ForecastPageClient initialData={initial} />
}
