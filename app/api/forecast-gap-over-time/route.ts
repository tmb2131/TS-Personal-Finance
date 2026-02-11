import { createClient } from '@/lib/supabase/server'
import { computeForecastGapSeries } from '@/lib/forecast-evolution'
import { NextResponse } from 'next/server'

export type ForecastGapOverTimePoint = {
  date: string
  gap: number
}

/**
 * GET /api/forecast-gap-over-time?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Returns total gap to budget (annual_budget - forecast, expense categories only) per date in range.
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
      endDate = new Date().toISOString().split('T')[0]
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await computeForecastGapSeries(supabase, user.id, startDate, endDate)
    return NextResponse.json({ data })
  } catch (error) {
    console.error('forecast-gap-over-time error', error)
    const message = error instanceof Error ? error.message : 'Failed to compute gap series'
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
