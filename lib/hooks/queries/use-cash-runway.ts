'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

export function useCashRunway() {
  return useQuery({
    queryKey: queryKeys.cashRunway,
    queryFn: async () => {
      const res = await fetch('/api/cash-runway', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch cash runway')
      return res.json()
    },
  })
}
