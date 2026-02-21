'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useDailySummary } from './daily-summary-context'
import { WelcomeBack } from './welcome-back'

/**
 * Wrapper for Key Insights page content. When openDaily=1 we show the
 * "Welcome back" state (mobile only, via CSS) until the daily summary modal
 * has opened, then show children. Uses media queries so the correct view
 * is chosen on first paint and avoids flicker.
 */
export function InsightsContentWithOpenDaily({
  children,
}: {
  children: React.ReactNode
}) {
  const searchParams = useSearchParams()
  const { isOpen } = useDailySummary()
  const [postLoginModalOpened, setPostLoginModalOpened] = useState(false)

  const openDaily = searchParams.get('openDaily') === '1'

  useEffect(() => {
    if (openDaily && isOpen) {
      setPostLoginModalOpened(true)
    }
  }, [openDaily, isOpen])

  const showWelcomeUntilModal = openDaily && !postLoginModalOpened

  if (showWelcomeUntilModal) {
    return (
      <>
        <div className="md:hidden">
          <WelcomeBack />
        </div>
        <div className="hidden md:block">{children}</div>
      </>
    )
  }

  return <>{children}</>
}
