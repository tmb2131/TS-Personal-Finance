'use client'

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react'

export type InsightsSeedData = {
  budgetData: unknown[]
  annualTrends: unknown[]
  monthlyTrends: unknown[]
  forecastByCategory: Array<{
    category: string
    forecast: number
    ytd: number
    annualBudget: number
  }>
}

type InsightsDataContextValue = {
  insightsData: InsightsSeedData | null
  setInsightsData: (data: InsightsSeedData | null) => void
}

const InsightsDataContext = createContext<InsightsDataContextValue | undefined>(undefined)

export function InsightsDataProvider({ children }: { children: ReactNode }) {
  const [insightsData, setInsightsData] = useState<InsightsSeedData | null>(null)

  const value = useMemo(
    () => ({ insightsData, setInsightsData }),
    [insightsData]
  )

  return (
    <InsightsDataContext.Provider value={value}>
      {children}
    </InsightsDataContext.Provider>
  )
}

export function useInsightsDataContext() {
  const context = useContext(InsightsDataContext)
  if (!context) {
    throw new Error('useInsightsDataContext must be used within InsightsDataProvider')
  }
  return context
}

export function InsightsDataHydrator({ data }: { data: InsightsSeedData | null }) {
  const { setInsightsData } = useInsightsDataContext()

  useEffect(() => {
    setInsightsData(data)
    return () => setInsightsData(null)
  }, [data, setInsightsData])

  return null
}
