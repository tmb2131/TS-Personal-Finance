'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { createClient } from '@/lib/supabase/client'
import type { AccountBalance } from '@/lib/types'

export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts,
    queryFn: async (): Promise<AccountBalance[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('account_balances')
        .select('*')
        .order('category')
        .order('institution')

      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
}
