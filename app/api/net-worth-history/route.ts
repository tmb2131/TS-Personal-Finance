import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { rebuildHistoricalNetWorthFromAccountHistory } from '@/lib/snapshot-historical-net-worth'

const MAX_ROWS = 200
const PAGE_SIZE = 1000
const EPSILON = 0.0001
const DEFAULT_GBPUSD_RATE = 1.25

const UpdateRowSchema = z.object({
  year: z.number().int().min(1900).max(2100),
  personal: z.number().finite(),
  family: z.number().finite(),
  trust: z.number().finite(),
})

const UpdateSchema = z.object({
  currency: z.enum(['GBP', 'USD']),
  rows: z.array(UpdateRowSchema).min(1).max(MAX_ROWS),
})

type HistoricalRow = {
  date: string
  category: string
  amount_gbp: number | null
  amount_usd: number | null
  data_source: 'app_generated' | 'manual' | null
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function toMoney(value: number): number {
  return Math.round(value * 100) / 100
}

async function fetchHistoricalRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<HistoricalRow[]> {
  const allRows: HistoricalRow[] = []
  let page = 0

  while (true) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, error } = await supabase
      .from('historical_net_worth')
      .select('date, category, amount_gbp, amount_usd, data_source')
      .eq('user_id', userId)
      .order('date', { ascending: true })
      .range(from, to)

    if (error) throw error
    if (!data || data.length === 0) break
    allRows.push(...(data as HistoricalRow[]))
    if (data.length < PAGE_SIZE) break
    page += 1
  }

  return allRows
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const rows = await fetchHistoricalRows(supabase, user.id)
    const currentYear = new Date().getUTCFullYear()

    const latestByYearCategory = new Map<
      string,
      {
        date: string
        amount_gbp: number
        amount_usd: number
        data_source: 'app_generated' | 'manual' | null
      }
    >()

    for (const row of rows) {
      const date = normalizeDate(row.date)
      if (!date) continue

      const year = Number(date.slice(0, 4))
      if (!Number.isFinite(year) || year >= currentYear) continue // historical years only

      const category = (row.category || '').trim()
      if (!['Personal', 'Family', 'Trust'].includes(category)) continue

      const key = `${year}|${category}`
      const existing = latestByYearCategory.get(key)
      if (!existing || date > existing.date) {
        latestByYearCategory.set(key, {
          date,
          amount_gbp: Number(row.amount_gbp ?? 0),
          amount_usd: Number(row.amount_usd ?? 0),
          data_source: row.data_source ?? null,
        })
      }
    }

    const years = Array.from(
      new Set(Array.from(latestByYearCategory.keys()).map((key) => Number(key.split('|')[0])))
    ).sort((a, b) => b - a)

    const responseRows = years.map((year) => {
      const personal = latestByYearCategory.get(`${year}|Personal`)
      const family = latestByYearCategory.get(`${year}|Family`)
      const trust = latestByYearCategory.get(`${year}|Trust`)

      return {
        year,
        personal_gbp: toMoney(personal?.amount_gbp ?? 0),
        family_gbp: toMoney(family?.amount_gbp ?? 0),
        trust_gbp: toMoney(trust?.amount_gbp ?? 0),
        personal_usd: toMoney(personal?.amount_usd ?? 0),
        family_usd: toMoney(family?.amount_usd ?? 0),
        trust_usd: toMoney(trust?.amount_usd ?? 0),
        has_manual_override:
          personal?.data_source === 'manual' ||
          family?.data_source === 'manual' ||
          trust?.data_source === 'manual',
      }
    })

    return NextResponse.json({ success: true, rows: responseRows })
  } catch (error: any) {
    console.error('Net-worth-history GET error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch net worth history' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = UpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const currentYear = new Date().getUTCFullYear()
    const dedupedByYear = new Map<number, z.infer<typeof UpdateRowSchema>>()
    for (const row of parsed.data.rows) {
      if (row.year >= currentYear) {
        return NextResponse.json(
          { success: false, error: `Year ${row.year} is not historical. Only years before ${currentYear} can be edited.` },
          { status: 400 }
        )
      }
      dedupedByYear.set(row.year, row)
    }

    const { data: fxCurrent, error: fxError } = await supabase
      .from('fx_rate_current')
      .select('gbpusd_rate')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (fxError) throw fxError
    const gbpUsdRate = Number(fxCurrent?.gbpusd_rate ?? DEFAULT_GBPUSD_RATE) || DEFAULT_GBPUSD_RATE

    const convertToPair = (value: number) => {
      if (parsed.data.currency === 'GBP') {
        const gbp = value
        const usd = value * gbpUsdRate
        return { gbp: toMoney(gbp), usd: toMoney(usd) }
      }
      const usd = value
      const gbp = gbpUsdRate > 0 ? value / gbpUsdRate : value
      return { gbp: toMoney(gbp), usd: toMoney(usd) }
    }

    for (const row of dedupedByYear.values()) {
      const date = `${row.year}-12-31`
      const categoryValues: Array<{ category: 'Personal' | 'Family' | 'Trust'; value: number }> = [
        { category: 'Personal', value: row.personal },
        { category: 'Family', value: row.family },
        { category: 'Trust', value: row.trust },
      ]

      for (const item of categoryValues) {
        if (Math.abs(item.value) <= EPSILON) {
          const { error: deleteError } = await supabase
            .from('historical_net_worth')
            .delete()
            .eq('user_id', user.id)
            .eq('date', date)
            .eq('category', item.category)
            .eq('data_source', 'manual')
          if (deleteError) throw deleteError
          continue
        }

        const converted = convertToPair(item.value)
        const { error: upsertError } = await supabase
          .from('historical_net_worth')
          .upsert(
            {
              user_id: user.id,
              date,
              category: item.category,
              amount_gbp: converted.gbp,
              amount_usd: converted.usd,
              data_source: 'manual',
            },
            { onConflict: 'user_id,date,category' }
          )
        if (upsertError) throw upsertError
      }
    }

    await rebuildHistoricalNetWorthFromAccountHistory(supabase, user.id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Net-worth-history PUT error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save net worth history' },
      { status: 500 }
    )
  }
}
