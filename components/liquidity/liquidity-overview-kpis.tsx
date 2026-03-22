'use client'

import { useMemo } from 'react'
import { useAccounts } from '@/lib/hooks/queries/use-accounts'
import { AccountBalance } from '@/lib/types'
import { KPICard } from '@/components/kpi-card'
import { useCurrency } from '@/lib/contexts/currency-context'

export default function LiquidityOverviewKPIs() {
  const { currency, convertAmount, fxRate } = useCurrency()
  const { data, isLoading } = useAccounts()

  const { cashTotal, liquidTotal, instantTotal } = useMemo(() => {
    const accounts = data ?? []
    if (!accounts.length) {
      return { cashTotal: 0, liquidTotal: 0, instantTotal: 0 }
    }

    const accountsMap = new Map<string, AccountBalance>()
    // Deduplicate by institution + account_name, keeping most recent
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

    return { cashTotal: cash, liquidTotal: liquid, instantTotal: instant }
  }, [data, currency, convertAmount, fxRate])

  if (isLoading) {
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
