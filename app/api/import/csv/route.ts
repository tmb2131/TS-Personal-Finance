import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { normalizeCounterparty } from '@/lib/csv-parser'
import { rebuildYoYNetWorthFromAppData } from '@/lib/yoy-net-worth'

const CsvTransactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().default('Uncategorized'),
  counterparty: z.string().nullable(),
  amount: z.number(),
  currency: z.enum(['USD', 'GBP']),
})

const ImportRequestSchema = z.object({
  transactions: z.array(CsvTransactionSchema).min(1).max(5000),
})

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = ImportRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { transactions } = parsed.data

    // Get the date range for batch dedup
    const dates = transactions.map(t => t.date)
    const minDate = dates.reduce((a, b) => a < b ? a : b)
    const maxDate = dates.reduce((a, b) => a > b ? a : b)

    // Fetch existing transactions in the date range for dedup
    const { data: existing } = await supabase
      .from('transaction_log')
      .select('date, counterparty_dedup, amount_usd, amount_gbp')
      .eq('user_id', user.id)
      .gte('date', minDate)
      .lte('date', maxDate)

    // Build a set of existing keys for fast lookup
    const existingKeys = new Set(
      (existing ?? []).map(row => {
        const amount = row.amount_usd ?? row.amount_gbp ?? 0
        return `${row.date}|${row.counterparty_dedup ?? ''}|${amount}`
      })
    )

    // Separate new vs duplicate
    const toInsert: Array<{
      user_id: string
      date: string
      category: string
      counterparty: string | null
      counterparty_dedup: string
      amount_usd: number | null
      amount_gbp: number | null
      currency: string
      data_source: string
    }> = []
    let duplicates = 0
    let errors = 0

    for (const tx of transactions) {
      const dedup = normalizeCounterparty(tx.counterparty)
      const key = `${tx.date}|${dedup}|${tx.amount}`

      if (existingKeys.has(key)) {
        duplicates++
        continue
      }

      // Also check against rows we're about to insert (intra-batch dedup)
      existingKeys.add(key)

      toInsert.push({
        user_id: user.id,
        date: tx.date,
        category: tx.category || 'Uncategorized',
        counterparty: tx.counterparty,
        counterparty_dedup: dedup,
        amount_usd: tx.currency === 'USD' ? tx.amount : null,
        amount_gbp: tx.currency === 'GBP' ? tx.amount : null,
        currency: tx.currency,
        data_source: 'csv',
      })
    }

    // Batch insert in chunks of 500
    let imported = 0
    for (let i = 0; i < toInsert.length; i += 500) {
      const chunk = toInsert.slice(i, i + 500)
      const { error } = await supabase.from('transaction_log').insert(chunk)
      if (error) {
        console.error('CSV import insert error:', error)
        errors += chunk.length
      } else {
        imported += chunk.length
      }
    }

    if (imported > 0) {
      try {
        await rebuildYoYNetWorthFromAppData(supabase, user.id)
      } catch (rebuildError) {
        console.error('CSV import: failed to rebuild YoY net worth data', rebuildError)
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      duplicates,
      errors,
      total: transactions.length,
    })
  } catch (error: any) {
    console.error('CSV import API error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to import CSV' },
      { status: 500 }
    )
  }
}
