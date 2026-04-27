import { NextResponse } from 'next/server'
import { fetchTransactionForecast } from '@/lib/data/forecast-transaction-data'

/**
 * GET /api/forecast/transaction-based
 *
 * Returns the transaction-based forecast for the current user (no params).
 * Response shape: TransactionForecastResult (see lib/forecast-transaction-based.ts).
 */
export async function GET() {
  try {
    const result = await fetchTransactionForecast()
    if (!result) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('forecast/transaction-based error', error)
    const message = error instanceof Error ? error.message : 'Failed to compute forecast'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
