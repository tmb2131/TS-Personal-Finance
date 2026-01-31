import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export type ForecastBridgeDriver = {
  category: string
  startForecast: number
  endForecast: number
  delta: number
}

export type ForecastBridgeResponse = {
  startDate: string
  endDate: string
  totalStart: number
  totalEnd: number
  drivers: ForecastBridgeDriver[]
}

/**
 * GET /api/forecast-bridge?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Fetches budget_history for start and end dates, computes deltas, returns top 5 drivers + Other.
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
      .select('category, forecast_spend')
      .eq('date', startDate),
    supabase
      .from('budget_history')
      .select('category, forecast_spend')
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

  const startMap = new Map<string, number>()
  for (const row of startRes.data ?? []) {
    const v = row.forecast_spend
    startMap.set(row.category, typeof v === 'number' ? v : Number(v) || 0)
  }
  const endMap = new Map<string, number>()
  for (const row of endRes.data ?? []) {
    const v = row.forecast_spend
    endMap.set(row.category, typeof v === 'number' ? v : Number(v) || 0)
  }

  const allCategories = new Set([...startMap.keys(), ...endMap.keys()])
  const deltas: ForecastBridgeDriver[] = []
  for (const category of allCategories) {
    const startForecast = startMap.get(category) ?? 0
    const endForecast = endMap.get(category) ?? 0
    const delta = endForecast - startForecast
    deltas.push({ category, startForecast, endForecast, delta })
  }

  deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  const top5 = deltas.slice(0, 5)
  const rest = deltas.slice(5)
  const other: ForecastBridgeDriver = {
    category: 'Other',
    startForecast: rest.reduce((s, d) => s + d.startForecast, 0),
    endForecast: rest.reduce((s, d) => s + d.endForecast, 0),
    delta: rest.reduce((s, d) => s + d.delta, 0),
  }
  const drivers = other.delta === 0 && rest.length === 0 ? top5 : [...top5, other]

  const totalStart = [...startMap.values()].reduce((a, b) => a + b, 0)
  const totalEnd = [...endMap.values()].reduce((a, b) => a + b, 0)

  const body: ForecastBridgeResponse = {
    startDate,
    endDate,
    totalStart,
    totalEnd,
    drivers,
  }
  return NextResponse.json(body)
}
