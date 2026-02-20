'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDailySummary } from './daily-summary-context'
import { shouldShowDailySummary } from './daily-summary-modal'

export function DailySummaryOnMount() {
  const searchParams = useSearchParams()
  const { openModal, startPrefetch } = useDailySummary()
  const openDaily = searchParams.get('openDaily') === '1'

  // Start prefetching daily summary data as soon as we're on insights so it's ready when the modal opens
  useEffect(() => {
    startPrefetch()
  }, [startPrefetch])

  useEffect(() => {
    if (!shouldShowDailySummary()) return

    // Post-login: open daily summary immediately so user doesn't see key insights first
    if (openDaily) {
      openModal()
      return
    }

    let cancelled = false

    async function checkForData() {
      const supabase = createClient()
      const { data: budgetData } = await supabase
        .from('budget_targets')
        .select('id')
        .limit(1)
      
      if (!cancelled && budgetData && budgetData.length > 0) {
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
  }, [openModal, openDaily])

  return null
}
