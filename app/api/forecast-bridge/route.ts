import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const EXCLUDED_CATEGORIES = ['Income', 'Gift Money', 'Other Income', 'Excluded']

export type ForecastBridgeDriver = {
  category: string
  startForecast: number
  endForecast: number
  delta: number
}

export type ForecastBridgeResponse = {
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

/**
 * GET /api/forecast-bridge?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Fetches budget_history for start and end dates (expense categories only).
 * Computes gap = annual_budget - forecast_spend per category; returns top 6 drivers by absolute change + Other.
 * endDate defaults to today.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('startDate')
  let endDate = searchParams.get('endDate')

  if (!startDate) {
    return NextResponse.json(
      { error: 'startDate is required (YYYY-MM-DD)' },
      { status: 400 }
    )
  }

  if (!endDate) {
    endDate = new Date().toISOString().split('T')[0]
  }

  const supabase = await createClient()

  const [startRes, endRes] = await Promise.all([
    supabase
      .from('budget_history')
      .select('category, annual_budget, forecast_spend')
      .eq('date', startDate),
    supabase
      .from('budget_history')
      .select('category, annual_budget, forecast_spend')
      .eq('date', endDate),
  ])

  if (startRes.error) {
    console.error('forecast-bridge startDate error', startRes.error)
    return NextResponse.json(
      { error: startRes.error.message },
      { status: 500 }
    )
  }
  if (endRes.error) {
    console.error('forecast-bridge endDate error', endRes.error)
    return NextResponse.json(
      { error: endRes.error.message },
      { status: 500 }
    )
  }

  const toNum = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)
  const isExpense = (c: string) => !EXCLUDED_CATEGORIES.includes(c)

  const startRows = (startRes.data ?? []).filter((r) => isExpense(r.category))
  const endRows = (endRes.data ?? []).filter((r) => isExpense(r.category))

  const startGapMap = new Map<string, { budget: number; forecast: number; gap: number }>()
  for (const row of startRows) {
    const budget = toNum(row.annual_budget)
    const forecast = toNum(row.forecast_spend)
    startGapMap.set(row.category, { budget, forecast, gap: budget - forecast })
  }
  const endGapMap = new Map<string, { budget: number; forecast: number; gap: number }>()
  for (const row of endRows) {
    const budget = toNum(row.annual_budget)
    const forecast = toNum(row.forecast_spend)
    endGapMap.set(row.category, { budget, forecast, gap: budget - forecast })
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

  // 1. Select top 6 by absolute value (biggest movers by magnitude)
  deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  const top6ByAbs = deltas.slice(0, 6)
  const rest = deltas.slice(6)

  // 2. Sort those 6 by nominal value for display: ascending if net improved, descending if net worsened
  const netChange = totalEnd - totalStart
  if (netChange < 0) {
    top6ByAbs.sort((a, b) => a.delta - b.delta) // ascending: most negative first
  } else {
    top6ByAbs.sort((a, b) => b.delta - a.delta) // descending: most positive first
  }

  const other: ForecastBridgeDriver = {
    category: 'Other',
    startForecast: rest.reduce((s, d) => s + d.startForecast, 0),
    endForecast: rest.reduce((s, d) => s + d.endForecast, 0),
    delta: rest.reduce((s, d) => s + d.delta, 0),
  }
  const drivers = other.delta === 0 && rest.length === 0 ? top6ByAbs : [...top6ByAbs, other]

  const body: ForecastBridgeResponse = {
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
  return NextResponse.json(body)
}
