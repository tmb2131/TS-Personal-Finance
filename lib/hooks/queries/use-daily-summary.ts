'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

export function useDailySummary() {
  return useQuery({
    queryKey: queryKeys.dailySummary,
    queryFn: async () => {
      const res = await fetch('/api/daily-summary')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? 'Failed to fetch daily summary')
      }
      return res.json()
    },
  })
}
