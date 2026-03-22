'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { createClient } from '@/lib/supabase/client'

export function useInvestmentReturns() {
  return useQuery({
    queryKey: queryKeys.investmentReturns,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.from('investment_return').select('*')
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
}
