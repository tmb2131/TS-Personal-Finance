import { createClient } from '@/lib/supabase/server'
import { computeForecastSnapshotsForDates } from '@/lib/forecast-evolution'
import {
  buildForecastBridgeFromSnapshots,
  toLocalDateString,
} from '@/lib/daily-summary-utils'
import { addCalendarDays } from '@/lib/daily-today-metrics'
import { NextResponse } from 'next/server'

/**
 * GET /api/daily-summary/delta
 * Returns only fields not already present in the insights page payload.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const localTodayStr = toLocalDateString(now)
    const localYesterdayStr = addCalendarDays(localTodayStr, -1)
    const utcTodayStr = now.toISOString().split('T')[0]
    const todayDateCandidates = Array.from(new Set([localTodayStr, utcTodayStr]))

    const [snapshots, syncResult, settingsResult, todayTxResult] = await Promise.all([
      computeForecastSnapshotsForDates(supabase, user.id, [localYesterdayStr, localTodayStr]),
      supabase.from('sync_metadata').select('last_sync_at').single(),
      supabase
        .from('forecast_settings')
        .select('category, current_year_method, manual_year_forecast'),
      supabase
        .from('transaction_log')
        .select('date, category, amount_gbp, amount_usd')
        .in('date', todayDateCandidates),
    ])

    const startSnapshot = snapshots.get(localYesterdayStr) ?? new Map()
    const endSnapshot = snapshots.get(localTodayStr) ?? new Map()
    const forecastBridge = buildForecastBridgeFromSnapshots(
      localYesterdayStr,
      localTodayStr,
      startSnapshot,
      endSnapshot
    )

    return NextResponse.json({
      forecastBridge,
      lastSyncDate: syncResult.data?.last_sync_at ?? null,
      forecastSettings: settingsResult.data ?? [],
      todayTransactions: todayTxResult.data ?? [],
    })
  } catch (error) {
    console.error('daily-summary delta error', error)
    const message =
      error instanceof Error ? error.message : 'Failed to build daily summary delta'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
