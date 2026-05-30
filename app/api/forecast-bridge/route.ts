import { createClient } from '@/lib/supabase/server'
import { computeForecastSnapshotsForDates } from '@/lib/forecast-evolution'
import { NextResponse } from 'next/server'
import { todayInTimeZone, getTimeZoneFromRequest } from '@/lib/date-utils'

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
 * Computes start/end forecast snapshots on the requested dates (expense categories only).
 * Gap is annual_budget - forecast per category; returns top 6 drivers by absolute change + Other.
 * endDate defaults to today.
 */
export async function GET(request: Request) {
  try {
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
      endDate = todayInTimeZone(getTimeZoneFromRequest(request))
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const snapshots = await computeForecastSnapshotsForDates(supabase, user.id, [startDate, endDate])
    const startSnapshot = snapshots.get(startDate) ?? new Map()
    const endSnapshot = snapshots.get(endDate) ?? new Map()

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
  } catch (error) {
    console.error('forecast-bridge error', error)
    const message = error instanceof Error ? error.message : 'Failed to build forecast bridge'
    const status =
      message.toLowerCase().includes('invalid date') ||
      message.toLowerCase().includes('must be on or before')
        ? 400
        : 500
    return NextResponse.json(
      { error: message },
      { status }
    )
  }
}
