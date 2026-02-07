import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const UpdateTransactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category: z.string().min(1).optional(),
  counterparty: z.string().nullable().optional(),
  amount_usd: z.number().nullable().optional(),
  amount_gbp: z.number().nullable().optional(),
  currency: z.enum(['USD', 'GBP']).optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { data: existing } = await supabase
      .from('transaction_log')
      .select('data_source')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 })
    }

    if (existing.data_source !== 'manual') {
      return NextResponse.json(
        { success: false, error: 'Can only edit manually entered data' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const parsed = UpdateTransactionSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const updates: Record<string, any> = { ...parsed.data }
    if (updates.counterparty !== undefined) {
      updates.counterparty_dedup = (updates.counterparty ?? '').toLowerCase().trim()
    }

    const { data, error } = await supabase
      .from('transaction_log')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating transaction:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Transaction PATCH error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update transaction' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { data: existing } = await supabase
      .from('transaction_log')
      .select('data_source')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 })
    }

    if (existing.data_source !== 'manual') {
      return NextResponse.json(
        { success: false, error: 'Can only delete manually entered data' },
        { status: 403 }
      )
    }

    const { error } = await supabase.from('transaction_log').delete().eq('id', id)

    if (error) {
      console.error('Error deleting transaction:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Transaction DELETE error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete transaction' },
      { status: 500 }
    )
  }
}
