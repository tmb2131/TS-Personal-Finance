'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { getClientTimeZone } from '@/lib/date-utils'

export function useForecastGapOverTime(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: [...queryKeys.forecastGapOverTime, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      const tz = getClientTimeZone()
      if (tz) params.set('tz', tz)
      const url = `/api/forecast-gap-over-time${params.toString() ? `?${params}` : ''}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch forecast gap over time')
      return res.json()
    },
  })
}
