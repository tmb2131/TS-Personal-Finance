'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

export function useForecastSnapshots() {
  return useQuery({
    queryKey: queryKeys.forecastSnapshots,
    queryFn: async () => {
      const res = await fetch('/api/forecast-snapshots', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to fetch forecast snapshots')
      return res.json()
    },
  })
}
