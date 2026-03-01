'use client'

import { useState, useEffect } from 'react'
import { useDailySummary } from './daily-summary-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'

/**
 * Wrapper for Key Insights page content. On mobile, we render nothing until the
 * daily summary modal has opened, so the app opens directly to the modal
 * (no Welcome back screen or Key Insights flash). On desktop, Key Insights
 * content is always shown.
 */
export function InsightsContentWithOpenDaily({
  children,
}: {
  children: React.ReactNode
}) {
  const isMobile = useIsMobile()
  const { isOpen } = useDailySummary()
  const [modalHasOpenedOnce, setModalHasOpenedOnce] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setModalHasOpenedOnce(true)
    }
  }, [isOpen])

  if (isMobile && !modalHasOpenedOnce) {
    return null
  }

  return <>{children}</>
}
