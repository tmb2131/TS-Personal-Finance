import { syncGoogleSheet } from '@/lib/sync-google-sheet'
import { finalizeDataPipeline } from '@/lib/ingestion'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateAllData } from '@/lib/cache-tags'

/**
 * Cron endpoint: run data sync per user (each user's sheet).
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

    const allResults: { sheet: string; success: boolean; error?: string; rowsProcessed: number }[] = []
    let anySuccess = true

    for (const profile of profiles ?? []) {
      const result = await syncGoogleSheet(admin, {
        spreadsheetId: profile.google_spreadsheet_id,
        userId: profile.id,
        fullTransactionReplace: true,
      })
      allResults.push(...(result.results ?? []))
      if (!result.success) anySuccess = false
      if (result.success) {
        const finalized = await finalizeDataPipeline({
          supabase: admin,
          userId: profile.id,
          context: `Cron sheet sync for user ${profile.id}`,
          rebuildYoYNetWorth: true,
          recordSyncTimestamp: true,
        })

        if (finalized.warnings.length > 0) {
          anySuccess = false
          for (const warning of finalized.warnings) {
            allResults.push({
              sheet: `${warning} (app pipeline)`,
              success: false,
              error: `Cron follow-up step failed: ${warning}`,
              rowsProcessed: 0,
            })
          }
        }
      }
    }

    revalidateAllData()

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
