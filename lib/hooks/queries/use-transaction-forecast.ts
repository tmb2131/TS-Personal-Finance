'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { TransactionForecastResult } from '@/lib/forecast-transaction-based'

export function useTransactionForecast(initialData?: TransactionForecastResult | null) {
  return useQuery({
    queryKey: queryKeys.transactionForecast,
    queryFn: async (): Promise<TransactionForecastResult> => {
      const res = await fetch('/api/forecast/transaction-based')
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || 'Failed to load transaction-based forecast')
      }
      return res.json()
    },
    initialData: initialData ?? undefined,
    staleTime: 5 * 60 * 1000,
  })
}
