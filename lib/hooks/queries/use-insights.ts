'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { InsightsDataPayload } from '@/lib/insights-data'

export function useInsights(options?: { initialData?: InsightsDataPayload | null }) {
  return useQuery({
    queryKey: queryKeys.insights,
    queryFn: async (): Promise<InsightsDataPayload> => {
      const res = await fetch('/api/insights')
      if (!res.ok) throw new Error('Failed to fetch insights')
      return res.json()
    },
    initialData: options?.initialData ?? undefined,
  })
}
