import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const UpdateAccountSchema = z.object({
  institution: z.string().min(1).optional(),
  account_name: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  currency: z.enum(['USD', 'GBP', 'EUR']).optional(),
  balance_total_local: z.number().optional(),
  balance_personal_local: z.number().optional(),
  balance_family_local: z.number().optional(),
  liquidity_profile: z.string().nullable().optional(),
  risk_profile: z.string().nullable().optional(),
  horizon_profile: z.string().nullable().optional(),
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
      .from('account_balances')
      .select('data_source')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 })
    }

    if (existing.data_source !== 'manual') {
      return NextResponse.json(
        { success: false, error: 'Can only edit manually entered data' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const parsed = UpdateAccountSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const updates: Record<string, any> = { ...parsed.data }
    updates.date_updated = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('account_balances')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating account:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Account PATCH error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update account' },
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
      .from('account_balances')
      .select('data_source')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 })
    }

    if (existing.data_source !== 'manual') {
      return NextResponse.json(
        { success: false, error: 'Can only delete manually entered data' },
        { status: 403 }
      )
    }

    const { error } = await supabase.from('account_balances').delete().eq('id', id)

    if (error) {
      console.error('Error deleting account:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Account DELETE error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete account' },
      { status: 500 }
    )
  }
}
