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
import { NextResponse } from 'next/server'

const EXCLUDED_CATEGORIES = ['Income', 'Gift Money', 'Other Income', 'Excluded']

type ForecastBridgeDriver = {
  category: string
  startForecast: number
  endForecast: number
  delta: number
}

type ForecastBridgePayload = {
  startDate: string
  endDate: string
  expensesBudgetStart: number
  expensesForecastStart: number
  expensesBudgetEnd: number
  expensesForecastEnd: number
  totalStart: number
  totalEnd: number
  drivers: ForecastBridgeDriver[]
}

function buildForecastBridgeFromSnapshots(
  startDate: string,
  endDate: string,
  startSnapshot: Map<string, { annualBudget: number; forecast: number; gap: number }>,
  endSnapshot: Map<string, { annualBudget: number; forecast: number; gap: number }>
): ForecastBridgePayload {
  const startGapMap = new Map<string, { budget: number; forecast: number; gap: number }>()
  for (const [category, values] of startSnapshot.entries()) {
    if (EXCLUDED_CATEGORIES.includes(category)) continue
    startGapMap.set(category, {
      budget: values.annualBudget,
      forecast: values.forecast,
      gap: values.gap,
    })
  }

  const endGapMap = new Map<string, { budget: number; forecast: number; gap: number }>()
  for (const [category, values] of endSnapshot.entries()) {
    if (EXCLUDED_CATEGORIES.includes(category)) continue
    endGapMap.set(category, {
      budget: values.annualBudget,
      forecast: values.forecast,
      gap: values.gap,
    })
  }

  const expensesBudgetStart = [...startGapMap.values()].reduce((s, x) => s + x.budget, 0)
  const expensesForecastStart = [...startGapMap.values()].reduce((s, x) => s + x.forecast, 0)
  const expensesBudgetEnd = [...endGapMap.values()].reduce((s, x) => s + x.budget, 0)
  const expensesForecastEnd = [...endGapMap.values()].reduce((s, x) => s + x.forecast, 0)
  const totalStart = expensesBudgetStart - expensesForecastStart
  const totalEnd = expensesBudgetEnd - expensesForecastEnd

  const allCategories = new Set([...startGapMap.keys(), ...endGapMap.keys()])
  const deltas: ForecastBridgeDriver[] = []
  for (const category of allCategories) {
    const startGap = startGapMap.get(category)?.gap ?? 0
    const endGap = endGapMap.get(category)?.gap ?? 0
    const delta = endGap - startGap
    deltas.push({
      category,
      startForecast: startGap,
      endForecast: endGap,
      delta,
    })
  }

  deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  const top6ByAbs = deltas.slice(0, 6)
  const rest = deltas.slice(6)

  const netChange = totalEnd - totalStart
  if (netChange < 0) {
    top6ByAbs.sort((a, b) => a.delta - b.delta)
  } else {
    top6ByAbs.sort((a, b) => b.delta - a.delta)
  }

  const other: ForecastBridgeDriver = {
    category: 'Other',
    startForecast: rest.reduce((s, d) => s + d.startForecast, 0),
    endForecast: rest.reduce((s, d) => s + d.endForecast, 0),
    delta: rest.reduce((s, d) => s + d.delta, 0),
  }
  const drivers =
    other.delta === 0 && rest.length === 0 ? top6ByAbs : [...top6ByAbs, other]

  return {
    startDate,
    endDate,
    expensesBudgetStart,
    expensesForecastStart,
    expensesBudgetEnd,
    expensesForecastEnd,
    totalStart,
    totalEnd,
    drivers,
  }
}

function toLocalDateString(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

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

    const [snapshots, annualTrends, monthlyTrends, forecastByCategory] =
      await Promise.all([
        computeForecastSnapshotsForDates(supabase, user.id, [
          yesterdayStr,
          utcTodayStr,
        ]),
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
