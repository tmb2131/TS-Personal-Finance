'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { createClient } from '@/lib/supabase/client'
import type { TransactionLog } from '@/lib/types'

function formatDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function useRecurringTransactions() {
  return useQuery({
    queryKey: queryKeys.recurring,
    queryFn: async (): Promise<TransactionLog[]> => {
      const supabase = createClient()
      const cutoff = new Date()
      cutoff.setMonth(cutoff.getMonth() - 30)
      const startDate = formatDateStr(cutoff)

      const all: TransactionLog[] = []
      const pageSize = 1000
      let page = 0
      let hasMore = true

      while (hasMore) {
        const from = page * pageSize
        const to = from + pageSize - 1
        const { data, error } = await supabase
          .from('transaction_log')
          .select('*')
          .gte('date', startDate)
          .order('date', { ascending: false })
          .range(from, to)

        if (error) throw new Error(error.message)
        const rows = (data || []) as TransactionLog[]
        all.push(...rows)
        hasMore = rows.length === pageSize
        page++
      }

      return all
    },
  })
}

export function useRecurringPreferences() {
  return useQuery({
    queryKey: queryKeys.recurringPreferences,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.from('recurring_preferences').select('*')
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
}
