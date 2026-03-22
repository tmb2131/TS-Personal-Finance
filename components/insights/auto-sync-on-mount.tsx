'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DUMMY_SHEET_ID } from '@/lib/ingestion-shared'
import { SYNC_COMPLETED_EVENT } from '@/lib/contexts/sync-context'

export function AutoSyncOnMount() {
  const router = useRouter()
  const queryClient = useQueryClient()
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
              queryClient.invalidateQueries()
              window.dispatchEvent(new CustomEvent(SYNC_COMPLETED_EVENT))
              router.refresh()
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
