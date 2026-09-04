'use client'

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { createClient } from '@/lib/supabase/client'
import type { GbpLedgerRow } from '@/lib/gbp-available'

/**
 * Ledger rows booked after the account snapshot, for the GBP available
 * roll-forward.
 *
 * The window is the staleness being corrected for rather than a fixed lookback,
 * which is why this depends on the snapshot date instead of standing alone: a
 * freshly typed-up set of balances fetches nothing, a six-month-old one fetches
 * six months. A fixed window would over-fetch on the landing page in the common
 * case and — the part that actually matters — silently truncate the roll-forward
 * whenever the balances were older than it, leaving the headline figure quietly
 * overstated with nothing on screen to say so.
 *
 * Only the six columns the roll-forward reads are selected; the transactions
 * page can have the whole row.
 */
export function useGbpLedger(sinceDate: string | null) {
  return useQuery({
    queryKey: queryKeys.gbpLedger(sinceDate),
    enabled: sinceDate !== null,
    queryFn: async (): Promise<GbpLedgerRow[]> => {
      const supabase = createClient()
      const all: GbpLedgerRow[] = []
      const pageSize = 1000

      for (let page = 0; ; page += 1) {
        const from = page * pageSize
        const { data, error } = await supabase
          .from('transaction_log')
          .select('date, category, counterparty, amount_gbp, amount_usd, currency')
          .gt('date', sinceDate as string)
          .order('date', { ascending: true })
          .range(from, from + pageSize - 1)

        if (error) throw new Error(error.message)
        const rows = (data ?? []) as GbpLedgerRow[]
        all.push(...rows)
        // The upper bound is left to `computeGbpAvailable`, which drops
        // future-dated rows against its own notion of today.
        if (rows.length < pageSize) return all
      }
    },
  })
}
