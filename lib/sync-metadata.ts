import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Records the current time as last_sync_at in sync_metadata for the given user.
 * Call after a successful sync (manual or cron).
 */
export async function recordLastSync(supabase: SupabaseClient, userId: string): Promise<void> {
  const now = new Date().toISOString()
  await supabase
    .from('sync_metadata')
    .upsert({ user_id: userId, last_sync_at: now }, { onConflict: 'user_id' })
}
