import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rebuildYoYNetWorthFromAppData } from '@/lib/yoy-net-worth'

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const result = await rebuildYoYNetWorthFromAppData(supabase, user.id)
    return NextResponse.json({ success: true, result })
  } catch (error: any) {
    console.error('YoY rebuild API error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to rebuild YoY net worth data' },
      { status: 500 }
    )
  }
}
