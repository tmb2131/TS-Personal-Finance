import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Records the current time as last_sync_at in sync_metadata.
 * Call after a successful sync (manual or cron).
 */
export async function recordLastSync(supabase: SupabaseClient): Promise<void> {
  const now = new Date().toISOString()
  await supabase
    .from('sync_metadata')
    .upsert({ id: 1, last_sync_at: now }, { onConflict: 'id' })
}
