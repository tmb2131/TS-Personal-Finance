'use client'

import { DailySummaryModal } from './daily-summary-modal'
import { useDailySummary } from './daily-summary-context'

export function DailySummaryWrapper() {
  const { isOpen, closeModal } = useDailySummary()

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeModal()
    }
  }

  return <DailySummaryModal open={isOpen} onOpenChange={handleOpenChange} />
}
