import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const CreateBudgetSchema = z.object({
  category: z.string().min(1),
  annual_budget_gbp: z.number().default(0),
  annual_budget_usd: z.number().default(0),
})

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('budget_targets')
      .select('*')
      .order('category')

    if (error) {
      console.error('Error fetching budgets:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Budget GET error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch budgets' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = CreateBudgetSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { data, error } = await supabase.from('budget_targets').insert({
      user_id: user.id,
      category: parsed.data.category,
      annual_budget_gbp: parsed.data.annual_budget_gbp,
      annual_budget_usd: parsed.data.annual_budget_usd,
      tracking_est_gbp: 0,
      ytd_gbp: 0,
      tracking_est_usd: 0,
      ytd_usd: 0,
      data_source: 'manual',
    }).select().single()

    if (error) {
      console.error('Error creating budget:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Budget API error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create budget' },
      { status: 500 }
    )
  }
}
