'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AccountBalance } from '@/lib/types'
import { KPICard } from '@/components/kpi-card'
import { useCurrency } from '@/lib/contexts/currency-context'

export default function LiquidityOverviewKPIs() {
  const { currency, convertAmount, fxRate } = useCurrency()
  const [loading, setLoading] = useState(true)
  const [cashTotal, setCashTotal] = useState(0)
  const [liquidTotal, setLiquidTotal] = useState(0)
  const [instantTotal, setInstantTotal] = useState(0)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const supabase = createClient()

      // Fetch all account balances
      const { data: accounts } = await supabase
        .from('account_balances')
        .select('*')
        .order('date_updated', { ascending: false })

      if (!accounts) {
        setLoading(false)
        return
      }

      // Deduplicate by institution + account_name, keeping most recent
      const accountsMap = new Map<string, AccountBalance>()
      accounts.forEach((account) => {
        const key = `${account.institution}-${account.account_name}`
        const existing = accountsMap.get(key)
        if (
          !existing ||
          new Date(account.date_updated) > new Date(existing.date_updated)
        ) {
          accountsMap.set(key, account)
        }
      })

      const latestAccounts = Array.from(accountsMap.values())

      // Calculate totals by liquidity level
      let cash = 0
      let liquid = 0
      let instant = 0

      latestAccounts.forEach((account) => {
        const amount = convertAmount(
          account.balance_total_local ?? 0,
          account.currency ?? 'USD',
          fxRate
        )

        // Cash: Cash category
        if (account.category === 'Cash') {
          cash += amount
        }

        // Liquid Assets: Cash + Brokerage categories
        if (account.category === 'Cash' || account.category === 'Brokerage') {
          liquid += amount
        }

        // Instant: Instant liquidity profile
        if (account.liquidity_profile === 'Instant') {
          instant += amount
        }
      })

      setCashTotal(cash)
      setLiquidTotal(liquid)
      setInstantTotal(instant)
      setLoading(false)
    }

    fetchData()
  }, [currency, convertAmount, fxRate])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="h-24 bg-muted/20 rounded animate-pulse" />
        <div className="h-24 bg-muted/20 rounded animate-pulse" />
        <div className="h-24 bg-muted/20 rounded animate-pulse" />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <KPICard title="Total Cash" value={cashTotal} subtitle="Cash accounts" />
      <KPICard title="Liquid Assets" value={liquidTotal} subtitle="Cash + Brokerage" />
      <KPICard title="Instant Liquidity" value={instantTotal} subtitle="Instant access only" />
    </div>
  )
}
