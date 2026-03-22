'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

export function useCategoryPlanning() {
  return useQuery({
    queryKey: queryKeys.categoryPlanning,
    queryFn: async () => {
      const res = await fetch('/api/category-planning', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to fetch category planning')
      const json = await res.json()
      return json.data ?? json.rows ?? json
    },
  })
}
