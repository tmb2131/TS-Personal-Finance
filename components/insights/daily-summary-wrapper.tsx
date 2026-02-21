'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { DailySummaryModal } from './daily-summary-modal'
import { useDailySummary } from './daily-summary-context'

export function DailySummaryWrapper() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { isOpen, openModal, closeModal, modalKey, consumePrefetch, startPrefetch } = useDailySummary()

  // Start prefetching daily summary data when user lands on insights page
  // This uses the correct provider instance (root layout's) and runs in parallel
  // with the server component data fetch, reducing perceived load time
  useEffect(() => {
    if (pathname === '/insights') {
      startPrefetch()
    }
  }, [pathname, startPrefetch])

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

  return (
    <DailySummaryModal
      open={isOpen}
      onOpenChange={handleOpenChange}
      modalKey={modalKey}
      consumePrefetch={consumePrefetch}
    />
  )
}
