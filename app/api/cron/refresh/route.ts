import { syncGoogleSheet } from '@/lib/sync-google-sheet'
import { snapshotBudgetHistory } from '@/lib/snapshot-budget-history'
import { recordLastSync } from '@/lib/sync-metadata'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * Cron endpoint: run data sync per user (each user's sheet) and snapshot budget_history.
 * Secured by CRON_SECRET. Loops over user_profiles with non-null google_spreadsheet_id.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const expected = process.env.CRON_SECRET
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const { data: profiles, error: listError } = await admin
      .from('user_profiles')
      .select('id, google_spreadsheet_id')
      .not('google_spreadsheet_id', 'is', null)

    if (listError) {
      console.error('Cron: failed to list user_profiles', listError)
      return NextResponse.json(
        { success: false, error: listError.message, results: [] },
        { status: 500 }
      )
    }

    const today = new Date().toISOString().split('T')[0]
    const allResults: { sheet: string; success: boolean; error?: string; rowsProcessed: number }[] = []
    let anySuccess = true

    for (const profile of profiles ?? []) {
      const result = await syncGoogleSheet(admin, {
        spreadsheetId: profile.google_spreadsheet_id,
        userId: profile.id,
      })
      allResults.push(...(result.results ?? []))
      if (!result.success) anySuccess = false
      await snapshotBudgetHistory(today, admin, profile.id)
      if (result.success) {
        await recordLastSync(admin, profile.id)
      }
    }

    return NextResponse.json({
      success: anySuccess,
      results: allResults,
      error: null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to sync data'
    console.error('Cron refresh error:', error)
    return NextResponse.json(
      { success: false, error: message, results: [] },
      { status: 500 }
    )
  }
}

/** Allow POST for cron services that send POST. */
export async function POST(request: Request) {
  return GET(request)
}
