'use client'

import { createContext, useContext, useState, ReactNode, useCallback } from 'react'

interface DailySummaryContextType {
  openModal: () => void
  closeModal: () => void
  isOpen: boolean
  modalKey: number
}

const DailySummaryContext = createContext<DailySummaryContextType | undefined>(undefined)

export function DailySummaryProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [modalKey, setModalKey] = useState(0)

  const openModal = useCallback(() => {
    // Increment key to force fresh mount, then open
    setModalKey((k) => k + 1)
    // Use requestAnimationFrame to ensure Dialog properly initializes
    requestAnimationFrame(() => {
      setIsOpen(true)
    })
  }, [])

  const closeModal = useCallback(() => {
    setIsOpen(false)
  }, [])

  return (
    <DailySummaryContext.Provider value={{ openModal, closeModal, isOpen, modalKey }}>
      {children}
    </DailySummaryContext.Provider>
  )
}

export function useDailySummary() {
  const context = useContext(DailySummaryContext)
  if (context === undefined) {
    throw new Error('useDailySummary must be used within a DailySummaryProvider')
  }
  return context
}
