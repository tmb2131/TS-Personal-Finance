'use client'

import { useEffect, useLayoutEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDailySummary } from './daily-summary-context'
import { shouldShowDailySummary } from './daily-summary-modal'

const MOBILE_BREAKPOINT = 768

export function DailySummaryOnMount() {
  const searchParams = useSearchParams()
  const { openModal } = useDailySummary()
  const openDaily = searchParams.get('openDaily') === '1'

  // Open modal before paint on mobile or when openDaily=1 (post-login)
  useLayoutEffect(() => {
    if (!shouldShowDailySummary()) return
    const mobile = typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
    if (openDaily || mobile) {
      openModal()
    }
  }, [openModal, openDaily])

  // Desktop only (no openDaily): open after async budget check + 500ms delay
  useEffect(() => {
    if (!shouldShowDailySummary()) return
    const mobile = typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
    if (openDaily || mobile) return

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
