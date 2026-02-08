import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const CreateDebtSchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1),
  purpose: z.string().nullable().optional(),
  amount_gbp: z.number().nullable().default(null),
  amount_usd: z.number().nullable().default(null),
})

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = CreateDebtSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase.from('debt').insert({
      user_id: user.id,
      type: parsed.data.type,
      name: parsed.data.name,
      purpose: parsed.data.purpose ?? null,
      amount_gbp: parsed.data.amount_gbp,
      amount_usd: parsed.data.amount_usd,
      date_updated: today,
      data_source: 'manual',
    }).select().single()

    if (error) {
      console.error('Error creating debt:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Debt POST error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create debt entry' },
      { status: 500 }
    )
  }
}
