'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

export function useNetWorthHistory(enabled = true) {
  return useQuery({
    queryKey: queryKeys.netWorthHistory,
    queryFn: async () => {
      const res = await fetch('/api/net-worth-history', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to fetch net worth history')
      return res.json()
    },
    enabled,
  })
}
