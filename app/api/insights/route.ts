import { createClient } from '@/lib/supabase/server'
import { fetchInsightsData } from '@/lib/insights-data'
import { NextResponse } from 'next/server'

/**
 * GET /api/insights
 * Returns all data needed for the Key Insights page (e.g. for client refetch after sync).
 * Prefer server-rendered data via the page; this endpoint is for optional client refresh.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await fetchInsightsData(supabase, user.id)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('insights API error', error)
    const message =
      error instanceof Error ? error.message : 'Failed to load insights'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
