'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { createClient } from '@/lib/supabase/client'
import type { BudgetTarget } from '@/lib/types'

export function useBudgets() {
  return useQuery({
    queryKey: queryKeys.budgets,
    queryFn: async (): Promise<BudgetTarget[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.from('budget_targets').select('*')
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
}
