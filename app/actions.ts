'use server'

import { syncGoogleSheet } from '@/lib/sync-google-sheet'

export async function syncData() {
  try {
    const result = await syncGoogleSheet()
    return { success: result.success, results: result.results }
  } catch (error: any) {
    console.error('Sync action error:', error)
    return { success: false, error: error.message }
  }
}
