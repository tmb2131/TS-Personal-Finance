'use client'

import { useState, useEffect } from 'react'
import { useDailySummary } from './daily-summary-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { WelcomeBack } from './welcome-back'

/**
 * Wrapper for Key Insights page content. On mobile, we show the "Welcome back"
 * state until the daily summary modal has opened (from openDaily=1 or auto-open),
 * so the app opens directly to the daily summary without flashing Key Insights.
 * On desktop, Key Insights content is always shown.
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

  const showWelcomeUntilModal = isMobile && !modalHasOpenedOnce

  if (showWelcomeUntilModal) {
    return (
      <>
        <WelcomeBack />
      </>
    )
  }

  return <>{children}</>
}
