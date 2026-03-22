'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { createClient } from '@/lib/supabase/client'

export function useDebt() {
  return useQuery({
    queryKey: queryKeys.debt,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.from('debt').select('*')
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
}
