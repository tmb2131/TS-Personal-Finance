import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * Snapshot current budget_targets into budget_history for the given date and user.
 * 
 * IMPORTANT: This function ONLY affects the specified user's data. The upsert uses
 * onConflict: 'user_id,date,category', which means:
 * - It will only update/insert rows matching this user's user_id
 * - It will NOT affect other users' historical data
 * - Each user's data is isolated by the unique constraint (user_id, date, category)
 * 
 * When using admin client (cron), pass userId and we filter by user_id. 
 * When using server client, RLS scopes rows; userId is still required to tag history rows.
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
  
  console.log(`[snapshotBudgetHistory] Starting snapshot for user ${userId}, date ${date}`)
  
  const { data: rows, error: selectError } = await db
    .from('budget_targets')
    .select('category, annual_budget_gbp, tracking_est_gbp, ytd_gbp')
    .eq('user_id', userId)

  if (selectError) {
    console.error('snapshotBudgetHistory: budget_targets select error', selectError)
    throw selectError
  }
  if (!rows?.length) {
    console.log(`[snapshotBudgetHistory] No budget_targets found for user ${userId}, skipping snapshot`)
    return
  }

  const historyRows = rows.map((row: { category: string; annual_budget_gbp: number; tracking_est_gbp: number; ytd_gbp: number }) => ({
    user_id: userId,
    date,
    category: row.category,
    annual_budget: row.annual_budget_gbp ?? null,
    forecast_spend: row.tracking_est_gbp ?? null,
    actual_ytd: row.ytd_gbp ?? null,
  }))

  console.log(`[snapshotBudgetHistory] Upserting ${historyRows.length} rows for user ${userId}, date ${date}`)
  
  // CRITICAL: onConflict uses 'user_id,date,category' - this ensures we only update/insert
  // rows for THIS user. Other users' data is completely unaffected.
  const { error: upsertError } = await db
    .from('budget_history')
    .upsert(historyRows, { onConflict: 'user_id,date,category' })

  if (upsertError) {
    console.error('snapshotBudgetHistory: budget_history upsert error', upsertError)
    throw upsertError
  }
  
  console.log(`[snapshotBudgetHistory] Successfully saved snapshot for user ${userId}, date ${date}`)
}
