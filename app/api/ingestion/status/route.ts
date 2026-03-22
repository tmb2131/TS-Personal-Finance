import { NextResponse } from 'next/server'
import { getIngestionStatusSnapshot } from '@/lib/ingestion'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const status = await getIngestionStatusSnapshot(supabase, user.id)
    return NextResponse.json({ success: true, data: status })
  } catch (error: any) {
    console.error('Ingestion status API error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to load ingestion status' },
      { status: 500 }
    )
  }
}
