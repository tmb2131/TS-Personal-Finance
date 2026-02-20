'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { DailySummaryModal } from './daily-summary-modal'
import { useDailySummary } from './daily-summary-context'

export function DailySummaryWrapper() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { isOpen, openModal, closeModal, modalKey, consumePrefetch } = useDailySummary()

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
