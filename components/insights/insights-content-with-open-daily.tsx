'use client'

import { useSearchParams } from 'next/navigation'

/**
 * When openDaily=1 (post-login), we hide the key insights content so the daily
 * summary modal is the first thing the user sees. Content is shown after they
 * close the modal (URL is cleared to /insights).
 */
export function InsightsContentWithOpenDaily({
  children,
}: {
  children: React.ReactNode
}) {
  const searchParams = useSearchParams()
  const openDaily = searchParams.get('openDaily') === '1'

  if (openDaily) {
    return null
  }

  return <>{children}</>
}
