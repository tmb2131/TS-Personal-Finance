'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

interface DailySummaryContextType {
  openModal: () => void
  closeModal: () => void
  isOpen: boolean
}

const DailySummaryContext = createContext<DailySummaryContextType | undefined>(undefined)

export function DailySummaryProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  const openModal = () => setIsOpen(true)
  const closeModal = () => setIsOpen(false)

  return (
    <DailySummaryContext.Provider value={{ openModal, closeModal, isOpen }}>
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
