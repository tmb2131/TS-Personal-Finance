import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const EXCLUDED_CATEGORIES = ['Income', 'Gift Money', 'Other Income', 'Excluded']

export type ForecastGapOverTimePoint = {
  date: string
  gap: number
}

/**
 * GET /api/forecast-gap-over-time?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Returns total gap to budget (annual_budget - forecast_spend, expense categories only) per date in range.
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
  const { data: rows, error } = await supabase
    .from('budget_history')
    .select('date, category, annual_budget, forecast_spend')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })

  if (error) {
    console.error('forecast-gap-over-time error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const toNum = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)
  const isExpense = (c: string) => !EXCLUDED_CATEGORIES.includes(c)

  const gapByDate = new Map<string, number>()
  for (const row of rows ?? []) {
    if (!isExpense(row.category)) continue
    const date = String(row.date)
    const budget = toNum(row.annual_budget)
    const forecast = toNum(row.forecast_spend)
    const gap = budget - forecast
    gapByDate.set(date, (gapByDate.get(date) ?? 0) + gap)
  }

  const data: ForecastGapOverTimePoint[] = Array.from(gapByDate.entries())
    .map(([date, gap]) => ({ date, gap }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return NextResponse.json({ data })
}
