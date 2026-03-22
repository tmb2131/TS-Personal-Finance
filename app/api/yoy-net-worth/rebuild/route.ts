import { NextResponse } from 'next/server'
import { CACHE_TAGS } from '@/lib/cache-tags'
import { finalizeDataPipeline } from '@/lib/ingestion'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const result = await finalizeDataPipeline({
      supabase,
      userId: user.id,
      context: 'Manual YoY rebuild',
      rebuildYoYNetWorth: true,
      revalidate: [CACHE_TAGS.NET_WORTH, CACHE_TAGS.BUDGETS, CACHE_TAGS.TRANSACTIONS],
    })
    return NextResponse.json({ success: true, warnings: result.warnings })
  } catch (error: any) {
    console.error('YoY rebuild API error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to rebuild YoY net worth data' },
      { status: 500 }
    )
  }
}
