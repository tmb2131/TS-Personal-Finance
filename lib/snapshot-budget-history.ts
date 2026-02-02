import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * Snapshot current budget_targets into budget_history for the given date and user.
 * When using admin client (cron), pass userId and we filter by user_id. When using server client, RLS scopes rows; userId is still required to tag history rows.
 */
export async function snapshotBudgetHistory(
  date: string,
  supabase?: SupabaseClient,
  userId?: string
): Promise<void> {
  const db = supabase ?? (await createClient())
  if (!userId) {
    console.error('snapshotBudgetHistory: userId is required')
    return
  }
  const { data: rows, error: selectError } = await db
    .from('budget_targets')
    .select('category, annual_budget_gbp, tracking_est_gbp, ytd_gbp')
    .eq('user_id', userId)

  if (selectError) {
    console.error('snapshotBudgetHistory: budget_targets select error', selectError)
    throw selectError
  }
  if (!rows?.length) return

  const historyRows = rows.map((row: { category: string; annual_budget_gbp: number; tracking_est_gbp: number; ytd_gbp: number }) => ({
    user_id: userId,
    date,
    category: row.category,
    annual_budget: row.annual_budget_gbp ?? null,
    forecast_spend: row.tracking_est_gbp ?? null,
    actual_ytd: row.ytd_gbp ?? null,
  }))

  const { error: upsertError } = await db
    .from('budget_history')
    .upsert(historyRows, { onConflict: 'user_id,date,category' })

  if (upsertError) {
    console.error('snapshotBudgetHistory: budget_history upsert error', upsertError)
    throw upsertError
  }
}
