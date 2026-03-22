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

export function useTransactions(dateRangeDays: number | null) {
  return useQuery({
    queryKey: queryKeys.transactions(dateRangeDays),
    queryFn: async (): Promise<TransactionLog[]> => {
      const supabase = createClient()
      const today = new Date()
      const endDateStr = formatDateStr(today)
      const startDateStr =
        dateRangeDays === null
          ? '2000-01-01'
          : (() => {
              const start = new Date(today)
              start.setDate(start.getDate() - dateRangeDays)
              return formatDateStr(start)
            })()

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
          .gte('date', startDateStr)
          .lte('date', endDateStr)
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
