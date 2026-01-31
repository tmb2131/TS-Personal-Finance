import { syncGoogleSheet } from '@/lib/sync-google-sheet'
import { snapshotBudgetHistory } from '@/lib/snapshot-budget-history'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      console.error('Sync API: Unauthorized - no user found')
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Sync API: Starting sync for user:', user.email)
    const result = await syncGoogleSheet()
    console.log('Sync API: Sync completed', { success: result.success, resultsCount: result.results?.length })

    const today = new Date().toISOString().split('T')[0]
    await snapshotBudgetHistory(today)
    console.log('Sync API: budget_history snapshot for', today, 'completed')

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
