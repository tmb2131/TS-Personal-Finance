import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import {
  computeTransactionForecast,
  TRAINING_YEARS,
  type ForecastTxRow,
  type TransactionForecastResult,
} from '@/lib/forecast-transaction-based'

const PAGE_SIZE = 1000

async function fetchTransactionsForForecast(
  supabase: SupabaseClient,
  userId: string,
  startDate: string,
): Promise<ForecastTxRow[]> {
  const buildQuery = (from: number, to: number) =>
    supabase
      .from('transaction_log')
      .select('date, category, counterparty, amount_gbp, amount_usd', { count: 'exact' })
      .eq('user_id', userId)
      .gte('date', startDate)
      .order('date', { ascending: true })
      .range(from, to)

  const { data: firstPage, count, error } = await buildQuery(0, PAGE_SIZE - 1)
  if (error) {
    console.error('fetchTransactionsForForecast error', error)
    return (firstPage ?? []) as ForecastTxRow[]
  }
  const rows = (firstPage ?? []) as ForecastTxRow[]
  const total = count ?? rows.length
  const remainingPages = Math.ceil((total - rows.length) / PAGE_SIZE)
  if (remainingPages <= 0) return rows
  const rest = await Promise.all(
    Array.from({ length: remainingPages }, (_, i) =>
      buildQuery((i + 1) * PAGE_SIZE, (i + 2) * PAGE_SIZE - 1).then(
        (r) => (r.data ?? []) as ForecastTxRow[],
      ),
    ),
  )
  return rows.concat(...rest)
}

async function fetchFxRateGBPUSD(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase.from('fx_rate_current').select('gbpusd_rate').limit(1).single()
  const rate = data?.gbpusd_rate
  return rate && rate > 0 ? rate : 1.25
}

/**
 * Server-side, request-deduped fetch + compute. Returns the full transaction-based
 * forecast for the current authenticated user.
 *
 * Pulls trailing-(TRAINING_YEARS+1) calendar years of data so that the backtest has
 * enough lookback to also use TRAINING_YEARS of training data. Returns null if
 * unauthenticated or on hard error.
 */
export const fetchTransactionForecast = cache(
  async (): Promise<TransactionForecastResult | null> => {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const now = new Date()
    // Backtest needs (currentYear - 1) plus TRAINING_YEARS of prior data; pull a year extra for safety.
    const startYear = now.getFullYear() - (TRAINING_YEARS + 1)
    const startDate = `${startYear}-01-01`

    try {
      const [rows, gbpUsdRate] = await Promise.all([
        fetchTransactionsForForecast(supabase, user.id, startDate),
        fetchFxRateGBPUSD(supabase),
      ])
      return computeTransactionForecast(rows, gbpUsdRate, now)
    } catch (err) {
      console.error('fetchTransactionForecast failed', err)
      return null
    }
  },
)
