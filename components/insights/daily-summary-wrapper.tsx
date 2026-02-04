'use client'

import { DailySummaryModal } from './daily-summary-modal'
import { useDailySummary } from './daily-summary-context'

export function DailySummaryWrapper() {
  const { isOpen, openModal, closeModal, modalKey } = useDailySummary()

  const handleOpenChange = (open: boolean) => {
    if (open) {
      openModal()
    } else {
      closeModal()
    }
  }

  return <DailySummaryModal open={isOpen} onOpenChange={handleOpenChange} modalKey={modalKey} />
}
