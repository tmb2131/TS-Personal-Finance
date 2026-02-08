import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const CreateSchema = z.object({
  income_source: z.string().min(1),
  amount_gbp: z.number().default(0),
})

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('investment_return')
      .select('*')
      .order('income_source')

    if (error) {
      console.error('Error fetching investment returns:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Investment returns GET error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch investment returns' },
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
    const parsed = CreateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { data, error } = await supabase.from('investment_return').insert({
      user_id: user.id,
      income_source: parsed.data.income_source,
      amount_gbp: parsed.data.amount_gbp,
    }).select().single()

    if (error) {
      console.error('Error creating investment return:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Investment return POST error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create investment return' },
      { status: 500 }
    )
  }
}
