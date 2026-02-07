import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const CreateAccountSchema = z.object({
  institution: z.string().min(1),
  account_name: z.string().min(1),
  category: z.string().min(1),
  currency: z.enum(['USD', 'GBP', 'EUR']),
  balance_total_local: z.number(),
  balance_personal_local: z.number().default(0),
  balance_family_local: z.number().default(0),
  liquidity_profile: z.string().nullable().optional(),
  risk_profile: z.string().nullable().optional(),
  horizon_profile: z.string().nullable().optional(),
})

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = CreateAccountSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase.from('account_balances').insert({
      user_id: user.id,
      date_updated: today,
      institution: parsed.data.institution,
      account_name: parsed.data.account_name,
      category: parsed.data.category,
      currency: parsed.data.currency,
      balance_total_local: parsed.data.balance_total_local,
      balance_personal_local: parsed.data.balance_personal_local,
      balance_family_local: parsed.data.balance_family_local,
      liquidity_profile: parsed.data.liquidity_profile ?? null,
      risk_profile: parsed.data.risk_profile ?? null,
      horizon_profile: parsed.data.horizon_profile ?? null,
      data_source: 'manual',
    }).select().single()

    if (error) {
      console.error('Error creating account:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Account API error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create account' },
      { status: 500 }
    )
  }
}
