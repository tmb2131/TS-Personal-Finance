'use client'

import { useEffect } from 'react'
import { useDailySummary } from './daily-summary-context'

/**
 * Tiny client component that triggers daily summary prefetch immediately on mount.
 * Used in the insights loading state to start the daily summary fetch in parallel
 * with the server component data fetch, reducing perceived load time.
 */
export function DailySummaryPrefetchTrigger() {
  const { startPrefetch } = useDailySummary()

  useEffect(() => {
    // Start prefetching daily summary data as soon as this component mounts
    startPrefetch()
  }, [startPrefetch])

  // This component doesn't render anything
  return null
}
