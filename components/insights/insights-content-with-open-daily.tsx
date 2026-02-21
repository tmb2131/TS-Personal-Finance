'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useDailySummary } from './daily-summary-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { WelcomeBack } from './welcome-back'

/**
 * Wrapper for Key Insights page content. When openDaily=1 on mobile, we show
 * the "Welcome back" state until the daily summary modal has opened, then
 * show children (so no flash of Key Insights before the modal).
 */
export function InsightsContentWithOpenDaily({
  children,
}: {
  children: React.ReactNode
}) {
  const searchParams = useSearchParams()
  const { isOpen } = useDailySummary()
  const isMobile = useIsMobile()
  const [postLoginModalOpened, setPostLoginModalOpened] = useState(false)

  const openDaily = searchParams.get('openDaily') === '1'

  useEffect(() => {
    if (openDaily && isOpen) {
      setPostLoginModalOpened(true)
    }
  }, [openDaily, isOpen])

  const showWelcomeUntilModal = isMobile && openDaily && !postLoginModalOpened

  if (showWelcomeUntilModal) {
    return (
      <div className="md:hidden">
        <WelcomeBack />
      </div>
    )
  }

  return <>{children}</>
}
