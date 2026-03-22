'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { IngestionStatusSnapshot } from '@/lib/ingestion-shared'

export function useIngestionStatus() {
  return useQuery({
    queryKey: queryKeys.ingestionStatus,
    queryFn: async (): Promise<IngestionStatusSnapshot | null> => {
      const response = await fetch('/api/ingestion/status', { cache: 'no-store' })
      if (!response.ok) return null
      const result = await response.json()
      if (result.success && result.data) return result.data as IngestionStatusSnapshot
      return null
    },
    staleTime: 60 * 1000,
  })
}
