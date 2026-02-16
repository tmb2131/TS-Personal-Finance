import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { revalidateTags, CACHE_TAGS } from '@/lib/cache-tags'

const CreateRecurringSchema = z.object({
  name: z.string().min(1),
  annualized_amount_gbp: z.number().nullable().default(null),
  annualized_amount_usd: z.number().nullable().default(null),
  needs_review: z.boolean().default(false),
})

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = CreateRecurringSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { data, error } = await supabase.from('recurring_payments').insert({
      user_id: user.id,
      name: parsed.data.name,
      annualized_amount_gbp: parsed.data.annualized_amount_gbp,
      annualized_amount_usd: parsed.data.annualized_amount_usd,
      needs_review: parsed.data.needs_review,
      data_source: 'manual',
    }).select().single()

    if (error) {
      console.error('Error creating recurring payment:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    revalidateTags(CACHE_TAGS.RECURRING)
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Recurring payment POST error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create recurring payment' },
      { status: 500 }
    )
  }
}
