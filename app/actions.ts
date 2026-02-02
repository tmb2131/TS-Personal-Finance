'use server'

import { syncGoogleSheet } from '@/lib/sync-google-sheet'
import { createClient } from '@/lib/supabase/server'

export async function syncData() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Unauthorized' }
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('google_spreadsheet_id')
      .eq('id', user.id)
      .single()
    if (!profile?.google_spreadsheet_id) {
      return { success: false, error: 'Connect your sheet first in Settings.' }
    }
    const result = await syncGoogleSheet(supabase, {
      spreadsheetId: profile.google_spreadsheet_id,
      userId: user.id,
    })
    return { success: result.success, results: result.results }
  } catch (error: any) {
    console.error('Sync action error:', error)
    return { success: false, error: error.message }
  }
}
