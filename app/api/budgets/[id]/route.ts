import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const UpdateBudgetSchema = z.object({
  annual_budget_gbp: z.number().optional(),
  annual_budget_usd: z.number().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = UpdateBudgetSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('budget_input_mode')
      .eq('id', user.id)
      .single()

    const updatePayload: {
      annual_budget_gbp?: number
      annual_budget_usd?: number
      data_source?: 'manual'
    } = {
      ...parsed.data,
    }

    if (profile?.budget_input_mode === 'app') {
      updatePayload.data_source = 'manual'
    }

    const { data, error } = await supabase
      .from('budget_targets')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating budget:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Budget PATCH error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update budget' },
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

    const [{ data: existing }, { data: profile }] = await Promise.all([
      supabase
        .from('budget_targets')
        .select('data_source')
        .eq('id', id)
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('user_profiles')
        .select('budget_input_mode')
        .eq('id', user.id)
        .single(),
    ])

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Budget not found' }, { status: 404 })
    }

    const isAppMode = profile?.budget_input_mode === 'app'
    if (existing.data_source !== 'manual' && !isAppMode) {
      return NextResponse.json(
        { success: false, error: 'Can only delete manually entered data while in sheet mode' },
        { status: 403 }
      )
    }

    const { error } = await supabase
      .from('budget_targets')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error deleting budget:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Budget DELETE error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete budget' },
      { status: 500 }
    )
  }
}
