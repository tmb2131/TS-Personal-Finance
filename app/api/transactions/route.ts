import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const CreateTransactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().min(1),
  counterparty: z.string().nullable().optional(),
  amount_usd: z.number().nullable().optional(),
  amount_gbp: z.number().nullable().optional(),
  currency: z.enum(['USD', 'GBP']),
})

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = CreateTransactionSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { date, category, counterparty, amount_usd, amount_gbp, currency } = parsed.data

    const { data, error } = await supabase.from('transaction_log').insert({
      user_id: user.id,
      date,
      category,
      counterparty: counterparty ?? null,
      counterparty_dedup: (counterparty ?? '').toLowerCase().trim(),
      amount_usd: amount_usd ?? null,
      amount_gbp: amount_gbp ?? null,
      currency,
      data_source: 'manual',
    }).select().single()

    if (error) {
      console.error('Error creating transaction:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Transaction API error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create transaction' },
      { status: 500 }
    )
  }
}
