'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { createClient } from '@/lib/supabase/client'
import type { KidsAccount } from '@/lib/types'

export function useKidsAccounts() {
  return useQuery({
    queryKey: queryKeys.kids,
    queryFn: async (): Promise<KidsAccount[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.from('kids_accounts').select('*')
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
}
