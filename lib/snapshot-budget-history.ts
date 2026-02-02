import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * Snapshot current budget_targets into budget_history for the given date.
 * Uses upsert on (date, category) so running twice the same day overwrites only that day's data.
 * @param supabase - Optional client (e.g. admin for cron). When omitted, uses server client.
 */
export async function snapshotBudgetHistory(date: string, supabase?: SupabaseClient): Promise<void> {
  const db = supabase ?? (await createClient())
  const { data: rows, error: selectError } = await db
    .from('budget_targets')
    .select('category, annual_budget_gbp, tracking_est_gbp, ytd_gbp')

  if (selectError) {
    console.error('snapshotBudgetHistory: budget_targets select error', selectError)
    throw selectError
  }
  if (!rows?.length) return

  const historyRows = rows.map((row: { category: string; annual_budget_gbp: number; tracking_est_gbp: number; ytd_gbp: number }) => ({
    date,
    category: row.category,
    annual_budget: row.annual_budget_gbp ?? null,
    forecast_spend: row.tracking_est_gbp ?? null,
    actual_ytd: row.ytd_gbp ?? null,
  }))

  const { error: upsertError } = await db
    .from('budget_history')
    .upsert(historyRows, { onConflict: 'date,category' })

  if (upsertError) {
    console.error('snapshotBudgetHistory: budget_history upsert error', upsertError)
    throw upsertError
  }
}
