import { createClient } from '@/lib/supabase/server'
import { computeForecastSnapshotsForDates } from '@/lib/forecast-evolution'
import {
  computeAnnualTrends,
  computeMonthlyTrends,
  computeAnnualForecasts,
  fetchFxRateGBPUSD,
  fetchForecastSettingsMap,
  fetchCategories,
  fetchTransactionsPaged,
} from '@/lib/forecasting'
import {
  buildForecastBridgeFromSnapshots,
  toDateOnly,
  toLocalDateString,
} from '@/lib/daily-summary-utils'
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
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]
    const utcTodayStr = now.toISOString().split('T')[0]
    const localTodayStr = toLocalDateString(now)
    const todayDateCandidates = Array.from(new Set([localTodayStr, utcTodayStr]))
    const currentYear = now.getFullYear()
    const txStartDate = `${currentYear - 4}-01-01`

    const [
      budgetResult,
      syncResult,
      settingsResult,
      todayTxResult,
      rate,
      settingsMap,
      categories,
      transactionRows,
    ] = await Promise.all([
      supabase.from('budget_targets').select('*'),
      supabase.from('sync_metadata').select('last_sync_at').single(),
      supabase
        .from('forecast_settings')
        .select('category, current_year_method, manual_year_forecast'),
      supabase
        .from('transaction_log')
        .select('date, category, amount_gbp, amount_usd')
        .in('date', todayDateCandidates),
      fetchFxRateGBPUSD(supabase),
      fetchForecastSettingsMap(supabase, user.id),
      fetchCategories(supabase, user.id),
      fetchTransactionsPaged(supabase, user.id, txStartDate),
    ])

    const preloaded = {
      rate,
      settingsMap,
      budgetRes: { data: budgetResult.data },
      categories,
      transactionRows,
    }
    const snapshotMinYearStart = `${yesterdayStr.split('-')[0]}-01-01`
    const snapshotTxRows = (transactionRows ?? [])
      .map((row) => {
        const date = toDateOnly(row.date)
        if (!date || date < snapshotMinYearStart || date > utcTodayStr) return null
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
        computeForecastSnapshotsForDates(supabase, user.id, [
          yesterdayStr,
          utcTodayStr,
        ], snapshotTxRows),
        computeAnnualTrends(supabase, user.id, preloaded),
        computeMonthlyTrends(supabase, user.id, preloaded),
        computeAnnualForecasts(supabase, user.id, preloaded),
      ])

    const startSnapshot = snapshots.get(yesterdayStr) ?? new Map()
    const endSnapshot = snapshots.get(utcTodayStr) ?? new Map()
    const forecastBridge = buildForecastBridgeFromSnapshots(
      yesterdayStr,
      utcTodayStr,
      startSnapshot,
      endSnapshot
    )

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
