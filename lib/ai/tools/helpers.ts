import type { SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_FX_RATE = 1.27

/**
 * Fetch the latest GBP/USD exchange rate from fx_rate_current.
 * Falls back to DEFAULT_FX_RATE if the table is empty.
 */
export async function fetchCurrentFxRateForTool(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from('fx_rate_current')
    .select('gbpusd_rate')
    .order('date', { ascending: false })
    .limit(1)
    .single()
  return data?.gbpusd_rate ?? DEFAULT_FX_RATE
}

export interface LatestAccountBalance {
  institution: string
  account_name: string
  date_updated: string
  balance_total_local: number
  balance_personal_local: number
  balance_family_local: number
  currency: string
  category: string
}

/**
 * Fetch account_balances and deduplicate to the most recent row per account.
 * Returns a Map keyed by "institution-account_name".
 */
export async function getLatestBalancePerAccount(
  supabase: SupabaseClient,
  userId: string
): Promise<{ balances: Map<string, LatestAccountBalance>; error: string | null }> {
  const { data, error } = await supabase
    .from('account_balances')
    .select('*')
    .eq('user_id', userId)
    .order('date_updated', { ascending: false })

  if (error) return { balances: new Map(), error: error.message }

  const map = new Map<string, LatestAccountBalance>()
  ;(data || []).forEach((b: Record<string, unknown>) => {
    const key = `${b.institution}-${b.account_name}`
    const existing = map.get(key)
    if (!existing || new Date(b.date_updated as string) > new Date(existing.date_updated)) {
      map.set(key, {
        institution: b.institution as string,
        account_name: b.account_name as string,
        date_updated: b.date_updated as string,
        balance_total_local: Number(b.balance_total_local ?? 0),
        balance_personal_local: Number(b.balance_personal_local ?? 0),
        balance_family_local: Number(b.balance_family_local ?? 0),
        currency: ((b.currency as string) || 'GBP').toUpperCase(),
        category: (b.category as string) || '',
      })
    }
  })

  return { balances: map, error: null }
}
