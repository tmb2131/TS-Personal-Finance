'use client'

/**
 * Wrapper for Key Insights page content. The daily summary modal is opened on
 * mount when openDaily=1 (see DailySummaryOnMount); we always render children
 * so the page is never blank if the modal is slow to open or has no data.
 */
export function InsightsContentWithOpenDaily({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
