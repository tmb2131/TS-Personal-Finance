'use client'

import { createContext, useContext, useState, ReactNode, useCallback, useRef } from 'react'

export type DailySummaryPrefetchedData = Awaited<ReturnType<typeof fetchDailySummaryJson>>

async function fetchDailySummaryJson(): Promise<unknown> {
  const res = await fetch('/api/daily-summary')
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Failed to fetch daily summary')
  }
  return res.json()
}

interface DailySummaryContextType {
  openModal: () => void
  closeModal: () => void
  isOpen: boolean
  modalKey: number
  /** Start prefetching daily summary data (e.g. when user lands on /insights). */
  startPrefetch: () => void
  /** Consume prefetched data if any; returns the promise or null. Caller should clear after use. */
  consumePrefetch: () => Promise<unknown> | null
}

const DailySummaryContext = createContext<DailySummaryContextType | undefined>(undefined)

export function DailySummaryProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [modalKey, setModalKey] = useState(0)
  const prefetchPromiseRef = useRef<Promise<unknown> | null>(null)

  const startPrefetch = useCallback(() => {
    if (prefetchPromiseRef.current == null) {
      prefetchPromiseRef.current = fetchDailySummaryJson()
    }
  }, [])

  const consumePrefetch = useCallback((): Promise<unknown> | null => {
    const p = prefetchPromiseRef.current
    prefetchPromiseRef.current = null
    return p
  }, [])

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
    <DailySummaryContext.Provider
      value={{ openModal, closeModal, isOpen, modalKey, startPrefetch, consumePrefetch }}
    >
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
