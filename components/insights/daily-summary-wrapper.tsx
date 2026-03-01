'use client'

import dynamic from 'next/dynamic'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useDailySummary } from './daily-summary-context'
import { useInsightsDataContext } from './insights-data-context'

const LazyDailySummaryModal = dynamic(
  () => import('./daily-summary-modal').then((m) => ({ default: m.DailySummaryModal })),
  { ssr: false, loading: () => null }
)

export function DailySummaryWrapper() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const {
    isOpen,
    openModal,
    closeModal,
    modalKey,
    consumePrefetch,
    startPrefetch,
    getCachedPayload,
    setCachedPayload,
  } = useDailySummary()
  const { insightsData } = useInsightsDataContext()
  const [hasRequestedModal, setHasRequestedModal] = useState(() => {
    if (typeof window === 'undefined') return false
    const mobile = window.innerWidth < 768
    return mobile && window.location.pathname === '/insights'
  })

  // Start prefetching daily summary data when user lands on insights page
  // This uses the correct provider instance (root layout's) and runs in parallel
  // with the server component data fetch, reducing perceived load time
  useEffect(() => {
    if (pathname === '/insights' && !insightsData) {
      startPrefetch()
    }
  }, [insightsData, pathname, startPrefetch])

  useEffect(() => {
    if (isOpen) {
      setHasRequestedModal(true)
    }
  }, [isOpen])

  const handleOpenChange = (open: boolean) => {
    if (open) {
      openModal()
    } else {
      closeModal()
      if (pathname === '/insights' && searchParams.get('openDaily') === '1') {
        router.replace('/insights')
      }
    }
  }

  if (!hasRequestedModal) return null

  return (
    <LazyDailySummaryModal
      open={isOpen}
      onOpenChange={handleOpenChange}
      modalKey={modalKey}
      consumePrefetch={consumePrefetch}
      getCachedPayload={getCachedPayload}
      setCachedPayload={setCachedPayload}
      insightsData={insightsData}
    />
  )
}
