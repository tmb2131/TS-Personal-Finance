import { computeForecastSnapshotsForDates } from '@/lib/forecast-evolution'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const MAX_DATES = 60

const parseDateParams = (value: string | null, all: string[]): string[] => {
  const values: string[] = []

  if (value) {
    value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
      .forEach((v) => values.push(v))
  }

  all
    .map((v) => v.trim())
    .filter(Boolean)
    .forEach((v) => values.push(v))

  return Array.from(new Set(values))
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dates = parseDateParams(searchParams.get('dates'), searchParams.getAll('dates'))

    if (dates.length === 0) {
      return NextResponse.json(
        { error: 'At least one date is required via dates=YYYY-MM-DD[,YYYY-MM-DD]' },
        { status: 400 }
      )
    }

    if (dates.length > MAX_DATES) {
      return NextResponse.json(
        { error: `Too many dates requested. Max allowed is ${MAX_DATES}.` },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const snapshots = await computeForecastSnapshotsForDates(supabase, user.id, dates)

    const data: Record<
      string,
      Record<string, { annualBudget: number; forecast: number; gap: number; ytd: number }>
    > = {}

    for (const [date, byCategory] of snapshots.entries()) {
      data[date] = {}
      for (const [category, values] of byCategory.entries()) {
        data[date][category] = values
      }
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('forecast-snapshots error', error)
    const message = error instanceof Error ? error.message : 'Failed to compute snapshots'
    const status = message.toLowerCase().includes('invalid date') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

