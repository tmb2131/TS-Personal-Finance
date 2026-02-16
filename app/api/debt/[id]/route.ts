import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { revalidateTags, CACHE_TAGS } from '@/lib/cache-tags'

const UpdateDebtSchema = z.object({
  type: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  purpose: z.string().nullable().optional(),
  amount_gbp: z.number().nullable().optional(),
  amount_usd: z.number().nullable().optional(),
})

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
      .from('debt')
      .select('id')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = UpdateDebtSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const updates: Record<string, any> = { ...parsed.data }
    updates.date_updated = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('debt')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating debt:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    revalidateTags(CACHE_TAGS.DEBT)
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Debt PATCH error:', error)
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
      .from('debt')
      .select('id')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }

    const { error } = await supabase.from('debt').delete().eq('id', id)

    if (error) {
      console.error('Error deleting debt:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    revalidateTags(CACHE_TAGS.DEBT)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Debt DELETE error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete' },
      { status: 500 }
    )
  }
}
