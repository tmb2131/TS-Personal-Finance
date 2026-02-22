import { syncGoogleSheet } from '@/lib/sync-google-sheet'
import { recordLastSync } from '@/lib/sync-metadata'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidateAllData } from '@/lib/cache-tags'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      console.error('Sync API: Unauthorized - no user found')
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('google_spreadsheet_id')
      .eq('id', user.id)
      .single()

    if (!profile?.google_spreadsheet_id) {
      return NextResponse.json(
        { success: false, error: 'Connect your Transaction Log sheet first in Settings.' },
        { status: 400 }
      )
    }

    console.log('Sync API: Starting sync for user:', user.email)
    const result = await syncGoogleSheet(supabase, {
      spreadsheetId: profile.google_spreadsheet_id,
      userId: user.id,
    })
    console.log('Sync API: Sync completed', { success: result.success, resultsCount: result.results?.length })

    if (result.success) {
      await recordLastSync(supabase, user.id)
      revalidateAllData()
      // Trigger YoY rebuild in background (separate invocation) so sync returns without waiting
      const origin = new URL(request.url).origin
      const cookie = request.headers.get('cookie') ?? ''
      void fetch(`${origin}/api/yoy-net-worth/rebuild`, {
        method: 'POST',
        headers: { cookie },
      }).catch((e) => console.error('Sync API: background YoY rebuild request failed', e))
    }

    // Ensure consistent response format
    return NextResponse.json({
      success: result.success,
      results: result.results || [],
      error: result.error || null,
    })
  } catch (error: any) {
    console.error('Sync API error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to sync data',
        results: []
      },
      { status: 500 }
    )
  }
}
