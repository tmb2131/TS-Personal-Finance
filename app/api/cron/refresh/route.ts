import { syncGoogleSheet } from '@/lib/sync-google-sheet'
import { snapshotBudgetHistory } from '@/lib/snapshot-budget-history'
import { recordLastSync } from '@/lib/sync-metadata'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * Cron endpoint: run data sync (e.g. daily at 6am) and snapshot budget into budget_history.
 * Secured by CRON_SECRET – only requests with Authorization: Bearer <CRON_SECRET> are accepted.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const expected = process.env.CRON_SECRET
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncGoogleSheet()
    const today = new Date().toISOString().split('T')[0]
    await snapshotBudgetHistory(today)
    if (result.success) {
      const admin = createAdminClient()
      await recordLastSync(admin)
    }
    return NextResponse.json({
      success: result.success,
      results: result.results ?? [],
      error: result.error ?? null,
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
