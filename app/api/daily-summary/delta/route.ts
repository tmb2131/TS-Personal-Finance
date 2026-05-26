import { createClient } from '@/lib/supabase/server'
import { computeForecastSnapshotsForDates } from '@/lib/forecast-evolution'
import { toLocalDateString } from '@/lib/daily-summary-utils'
import {
  addCalendarDays,
  buildForecastBridgeForYesterdaySpend,
  buildSpendByCategoryForDate,
} from '@/lib/daily-today-metrics'
import { fetchFxRateGBPUSD, fetchTransactionsPaged } from '@/lib/forecasting'
import { isExpenseCategory } from '@/lib/category-filters'
import { toDateOnly } from '@/lib/daily-summary-utils'
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
    const currentYear = now.getFullYear()
    const txStartDate = `${currentYear - 4}-01-01`

    const [snapshots, syncResult, settingsResult, todayTxResult, rate, transactionRows] =
      await Promise.all([
        computeForecastSnapshotsForDates(supabase, user.id, [localYesterdayStr]),
        supabase.from('sync_metadata').select('last_sync_at').single(),
        supabase
          .from('forecast_settings')
          .select('category, current_year_method, manual_year_forecast'),
        supabase
          .from('transaction_log')
          .select('date, category, amount_gbp, amount_usd')
          .in('date', todayDateCandidates),
        fetchFxRateGBPUSD(supabase),
        fetchTransactionsPaged(supabase, user.id, txStartDate),
      ])

    const yesterdaySnapshot = snapshots.get(localYesterdayStr) ?? new Map()
    const snapshotMinYearStart = `${localYesterdayStr.split('-')[0]}-01-01`
    const snapshotTxRows = (transactionRows ?? [])
      .map((row) => {
        const date = toDateOnly(row.date)
        if (!date || date < snapshotMinYearStart || date > localYesterdayStr) return null
        return {
          category: row.category,
          date,
          amount_gbp: row.amount_gbp ?? null,
          amount_usd: row.amount_usd ?? null,
        }
      })
      .filter(
        (
          row
        ): row is {
          category: string
          date: string
          amount_gbp: number | null
          amount_usd: number | null
        } => row !== null
      )
    const yesterdaySpendByCategory = buildSpendByCategoryForDate(
      snapshotTxRows,
      localYesterdayStr,
      rate,
      isExpenseCategory
    )
    const forecastBridge = buildForecastBridgeForYesterdaySpend(
      yesterdaySnapshot,
      localYesterdayStr,
      yesterdaySpendByCategory
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
