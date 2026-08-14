'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

export interface CashRunwayBurn {
  startDate: string
  endDate: string
  /** Full calendar months in the trailing window the mean is taken over. */
  months: number
  /** Total spend over the window, GBP, positive. */
  totalBurnGbp: number
  /**
   * Mean monthly spend, GBP, positive. The single denominator behind every
   * runway figure in the app — never split by the currency an account is held
   * in or a counterparty happens to bill in.
   */
  monthlyBurnGbp: number
}

export function useCashRunway() {
  return useQuery<CashRunwayBurn>({
    queryKey: queryKeys.cashRunway,
    queryFn: async () => {
      const res = await fetch('/api/cash-runway', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch cash runway')
      return res.json()
    },
  })
}
