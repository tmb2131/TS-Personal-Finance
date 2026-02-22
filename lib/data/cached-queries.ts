import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { BudgetTarget, HistoricalNetWorth } from '@/lib/types'
import type { FxRatesRow } from '@/lib/utils/fx-rates'
import {
  computeNetWorthTimeSeriesFromAccountBalances,
  computeLatestNetWorthSnapshotFromAccountBalances,
  type LatestNetWorthSnapshot,
} from '@/lib/net-worth-from-accounts'

/**
 * Two-layer caching strategy:
 * 1. React cache() — deduplicates within a single render pass (request)
 * 2. unstable_cache() — caches across requests until invalidated via revalidateTag()
 *    Only used for global (non-user-scoped) queries that don't need auth cookies.
 *    User-scoped queries use only React cache() since unstable_cache callbacks
 *    cannot access cookies().
 *
 * Cache tags used for invalidation:
 * - 'fx-rates' — fx_rates, fx_rate_current
 * - 'sync' — all data (after full sync)
 */

/** Fetch all budget_targets rows for the current user */
export const fetchBudgetTargets = cache(async (): Promise<BudgetTarget[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase.from('budget_targets').select('*')
  if (error) throw new Error(`Failed to load budget targets: ${error.message}`)
  return (data ?? []) as BudgetTarget[]
})

/** Fetch all investment_return rows for the current user */
export const fetchInvestmentReturns = cache(async () => {
  const supabase = await createClient()
  const { data, error } = await supabase.from('investment_return').select('*')
  if (error) throw new Error(`Failed to load investment returns: ${error.message}`)
  return data ?? []
})

/** Fetch FX rates for a date range (global table — safe for unstable_cache) */
export const fetchFxRatesRange = cache(async (minDate: string, maxDate: string): Promise<FxRatesRow[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('fx_rates')
    .select('date, gbpusd_rate')
    .gte('date', minDate)
    .lte('date', maxDate)
    .order('date', { ascending: true })
  if (error) throw new Error(`Failed to load FX rates: ${error.message}`)
  return (data ?? []) as FxRatesRow[]
})

/** Fetch the current FX rate (global table) */
export const fetchCurrentFxRate = cache(async (): Promise<number> => {
  const supabase = await createClient()
  const { data } = await supabase.from('fx_rate_current').select('gbpusd_rate').limit(1).single()
  return data?.gbpusd_rate ?? 1.25
})

/** Fetch historical net worth rows */
export const fetchHistoricalNetWorth = cache(async (): Promise<HistoricalNetWorth[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('historical_net_worth')
    .select('*')
    .order('date', { ascending: true })
  if (error) throw new Error(`Failed to load net worth data: ${error.message}`)
  return (data ?? []) as HistoricalNetWorth[]
})

/** Get current authenticated user */
export const fetchCurrentUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

/** Net worth time series computed from account_balances (no historical_net_worth). */
export const fetchNetWorthFromAccountBalances = cache(async (): Promise<HistoricalNetWorth[]> => {
  const user = await fetchCurrentUser()
  if (!user) return []
  const supabase = await createClient()
  return computeNetWorthTimeSeriesFromAccountBalances(supabase, user.id)
})

/** Current net worth (latest row per account) from account_balances for dashboard chart current year. */
export const fetchLatestNetWorthFromAccountBalances = cache(
  async (): Promise<LatestNetWorthSnapshot | null> => {
    const user = await fetchCurrentUser()
    if (!user) return null
    const supabase = await createClient()
    return computeLatestNetWorthSnapshotFromAccountBalances(supabase, user.id)
  }
)
