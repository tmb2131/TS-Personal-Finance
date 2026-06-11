'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import type { FinancialAssumptions } from '@/lib/types'

/** Returns the stored assumptions row, or null if the user has never saved one. */
export function useFinancialAssumptions() {
  return useQuery({
    queryKey: queryKeys.financialAssumptions,
    queryFn: async (): Promise<FinancialAssumptions | null> => {
      const res = await fetch('/api/financial-assumptions')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? 'Failed to fetch financial assumptions')
      }
      const json = await res.json()
      return (json.assumptions as FinancialAssumptions | null) ?? null
    },
  })
}
