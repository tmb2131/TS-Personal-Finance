import { createClient } from '@/lib/supabase/server'
import { computeForecastSnapshotsForDates } from '@/lib/forecast-evolution'
import {
  computeAnnualTrends,
  computeMonthlyTrends,
  computeAnnualForecasts,
  fetchFxRateGBPUSD,
  buildForecastSettingsMapFromData,
  fetchTransactionsPaged,
} from '@/lib/forecasting'
import type { SnapshotPreloaded } from '@/lib/forecast-evolution'
import { toDateOnly, toLocalDateString } from '@/lib/daily-summary-utils'
import {
  addCalendarDays,
  buildForecastBridgeSinceYesterday,
  computeImpliedForecastChangeIfNoMoreSpend,
} from '@/lib/daily-today-metrics'
import { NextResponse } from 'next/server'

/**
 * GET /api/daily-summary
 * Returns all data needed for the Daily Summary modal in one response.
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
    const localDayBeforeYesterdayStr = addCalendarDays(localTodayStr, -2)
    const utcTodayStr = now.toISOString().split('T')[0]
    const todayDateCandidates = Array.from(new Set([localTodayStr, utcTodayStr]))
    const currentYear = now.getFullYear()
    const txStartDate = `${currentYear - 4}-01-01`

    const [
      budgetResult,
      syncResult,
      settingsResult,
      todayTxResult,
      rate,
      transactionRows,
    ] = await Promise.all([
      supabase.from('budget_targets').select('category, annual_budget_gbp'),
      supabase.from('sync_metadata').select('last_sync_at').single(),
      supabase
        .from('forecast_settings')
        .select('category, current_year_method, current_month_method, manual_year_forecast, manual_month_forecast'),
      supabase
        .from('transaction_log')
        .select('date, category, amount_gbp, amount_usd')
        .in('date', todayDateCandidates),
      fetchFxRateGBPUSD(supabase),
      fetchTransactionsPaged(supabase, user.id, txStartDate),
    ])

    const settingsMap = buildForecastSettingsMapFromData(settingsResult.data ?? [])

    const categorySet = new Set<string>()
    for (const row of budgetResult.data ?? []) if (row.category) categorySet.add(row.category)
    for (const row of settingsResult.data ?? []) if (row.category) categorySet.add(row.category)
    const categories = Array.from(categorySet).sort((a, b) => a.localeCompare(b))

    const snapshotPreloaded: SnapshotPreloaded = {
      fxRate: rate,
      settingsData: (settingsResult.data ?? []).map((r) => ({
        category: r.category,
        current_year_method: r.current_year_method ?? null,
        manual_year_forecast: r.manual_year_forecast ?? null,
      })),
      budgetsData: budgetResult.data ?? [],
    }

    const preloaded = {
      rate,
      settingsMap,
      budgetRes: { data: budgetResult.data },
      categories,
      transactionRows,
    }
    const snapshotMinYearStart = `${localDayBeforeYesterdayStr.split('-')[0]}-01-01`
    const snapshotMaxDate = localTodayStr > utcTodayStr ? localTodayStr : utcTodayStr
    const snapshotTxRows = (transactionRows ?? [])
      .map((row) => {
        const date = toDateOnly(row.date)
        if (!date || date < snapshotMinYearStart || date > snapshotMaxDate) return null
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

    const [snapshots, annualTrends, monthlyTrends, forecastByCategory] =
      await Promise.all([
        computeForecastSnapshotsForDates(
          supabase,
          user.id,
          [localDayBeforeYesterdayStr, localYesterdayStr, localTodayStr],
          snapshotTxRows,
          snapshotPreloaded
        ),
        computeAnnualTrends(supabase, user.id, preloaded),
        computeMonthlyTrends(supabase, user.id, preloaded),
        computeAnnualForecasts(supabase, user.id, preloaded),
      ])

    const dayBeforeYesterdaySnapshot = snapshots.get(localDayBeforeYesterdayStr) ?? new Map()
    const yesterdaySnapshot = snapshots.get(localYesterdayStr) ?? new Map()
    const endSnapshot = snapshots.get(localTodayStr) ?? new Map()
    const forecastBridge = buildForecastBridgeSinceYesterday(
      dayBeforeYesterdaySnapshot,
      yesterdaySnapshot,
      localDayBeforeYesterdayStr,
      localYesterdayStr
    )

    const impliedForecastChangeIfNoMoreSpend = computeImpliedForecastChangeIfNoMoreSpend(
      endSnapshot,
      yesterdaySnapshot
    )
    const todayMetrics = {
      localTodayStr,
      localYesterdayStr,
      impliedForecastChangeIfNoMoreSpend,
      gapChangeSinceYesterday: forecastBridge.totalEnd - forecastBridge.totalStart,
    }

    const forecastByCategorySerialized = forecastByCategory
      ? Array.from(forecastByCategory.entries()).map(([category, value]) => ({
          category,
          forecast: value.forecast,
          ytd: value.ytd,
          annualBudget: value.annualBudget,
        }))
      : []

    const body = {
      budgetData: budgetResult.data ?? [],
      annualTrends: annualTrends ?? [],
      monthlyTrends: monthlyTrends ?? [],
      forecastBridge,
      todayMetrics,
      lastSyncDate: syncResult.data?.last_sync_at ?? null,
      forecastByCategory: forecastByCategorySerialized,
      forecastSettings: settingsResult.data ?? [],
      todayTransactions: todayTxResult.data ?? [],
    }

    return NextResponse.json(body)
  } catch (error) {
    console.error('daily-summary error', error)
    const message =
      error instanceof Error ? error.message : 'Failed to build daily summary'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
