import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const UpdateRecurringSchema = z.object({
  name: z.string().min(1).optional(),
  annualized_amount_gbp: z.number().nullable().optional(),
  annualized_amount_usd: z.number().nullable().optional(),
  needs_review: z.boolean().optional(),
})

const EDITABLE_DATA_SOURCES = new Set(['manual', 'csv'])

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { data: existing } = await supabase
      .from('recurring_payments')
      .select('data_source')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }

    if (!EDITABLE_DATA_SOURCES.has(existing.data_source)) {
      return NextResponse.json(
        { success: false, error: 'Can only edit app-managed data' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const parsed = UpdateRecurringSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const updates: Record<string, any> = { ...parsed.data }
    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('recurring_payments')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating recurring payment:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Recurring payment PATCH error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { data: existing } = await supabase
      .from('recurring_payments')
      .select('data_source')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }

    if (!EDITABLE_DATA_SOURCES.has(existing.data_source)) {
      return NextResponse.json(
        { success: false, error: 'Can only delete app-managed data' },
        { status: 403 }
      )
    }

    const { error } = await supabase.from('recurring_payments').delete().eq('id', id)

    if (error) {
      console.error('Error deleting recurring payment:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Recurring payment DELETE error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete' },
      { status: 500 }
    )
  }
}
