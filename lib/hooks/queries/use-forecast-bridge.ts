'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

export function useForecastBridge(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: [...queryKeys.forecastBridge, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      const url = `/api/forecast-bridge${params.toString() ? `?${params}` : ''}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch forecast bridge')
      return res.json()
    },
  })
}
