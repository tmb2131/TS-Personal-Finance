'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useDailySummary } from './daily-summary-context'
import { shouldShowDailySummary } from './daily-summary-modal'

export function DailySummaryOnMount() {
  const { openModal } = useDailySummary()

  useEffect(() => {
    // Check if we should show the modal (not dismissed)
    if (!shouldShowDailySummary()) return

    let cancelled = false

    // Check if user has data before showing
    async function checkForData() {
      const supabase = createClient()
      const { data: budgetData } = await supabase
        .from('budget_targets')
        .select('id')
        .limit(1)
      
      // Only show if there's actual budget data (not just dummy data)
      if (!cancelled && budgetData && budgetData.length > 0) {
        // Small delay to ensure page is loaded
        setTimeout(() => {
          if (!cancelled) {
            openModal()
          }
        }, 500)
      }
    }

    checkForData()

    return () => {
      cancelled = true
    }
  }, [openModal])

  return null
}
