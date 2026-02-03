'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const DUMMY_SHEET_ID = '1BxVuJ-DViN5nqpLc-8tGXex_pYiPY8dfL8UV5czCrHY'

export function AutoSyncOnMount() {
  const [hasChecked, setHasChecked] = useState(false)

  useEffect(() => {
    async function checkAndSync() {
      if (hasChecked) return
      
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setHasChecked(true)
        return
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('google_spreadsheet_id')
        .eq('id', user.id)
        .single()

      // Only auto-sync if user has dummy sheet ID
      if (profile?.google_spreadsheet_id === DUMMY_SHEET_ID) {
        // Check if data already exists (server-side sync might have completed)
        const { data: budgetData } = await supabase
          .from('budget_targets')
          .select('id')
          .limit(1)

        // If no data exists yet, trigger sync
        if (!budgetData || budgetData.length === 0) {
          try {
            const response = await fetch('/api/sync', { method: 'POST' })
            const result = await response.json().catch(() => ({}))

            if (response.ok && result.success) {
              // Refresh the page to show new data
              window.location.reload()
            } else {
              // Don't show error - let user see the page, they can refresh manually
              console.error('Auto-sync failed:', result.error)
            }
          } catch (err) {
            console.error('Auto-sync error:', err)
          }
        }
      }
      
      setHasChecked(true)
    }

    checkAndSync()
  }, [hasChecked])

  // This component doesn't render anything - it just triggers sync
  return null
}
