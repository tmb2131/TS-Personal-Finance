import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const CreateKidsAccountSchema = z.object({
  child_name: z.string().min(1),
  account_type: z.string().min(1),
  balance_usd: z.number(),
  notes: z.string().nullable().optional(),
  purpose: z.string().nullable().optional(),
})

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = CreateKidsAccountSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase.from('kids_accounts').insert({
      user_id: user.id,
      child_name: parsed.data.child_name,
      account_type: parsed.data.account_type,
      balance_usd: parsed.data.balance_usd,
      date_updated: today,
      notes: parsed.data.notes ?? null,
      purpose: parsed.data.purpose ?? null,
      data_source: 'manual',
    }).select().single()

    if (error) {
      console.error('Error creating kids account:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Kids account POST error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create kids account' },
      { status: 500 }
    )
  }
}
