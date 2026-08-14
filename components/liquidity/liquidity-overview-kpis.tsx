'use client'

import { useMemo } from 'react'
import { useAccounts } from '@/lib/hooks/queries/use-accounts'
import { KPICard } from '@/components/kpi-card'
import { useCurrency } from '@/lib/contexts/currency-context'
import { TRUST_EXCLUSION_LABEL } from '@/lib/trust-exclusions'
import { accountsOnBasis, liquidAssetsGbp, toGbp } from '@/lib/account-totals'

export default function LiquidityOverviewKPIs() {
  const { currency, convertAmount, fxRate } = useCurrency()
  const { data, isLoading } = useAccounts()

  const { cashTotal, liquidTotal, instantTotal } = useMemo(() => {
    const accounts = data ?? []
    if (!accounts.length) {
      return { cashTotal: 0, liquidTotal: 0, instantTotal: 0 }
    }

    // Dedupe, category normalization and the trust exclusion all live in
    // lib/account-totals, so this card reads the same "liquid" as Position's
    // KPI row and as the observations panel on Trends.
    const latestAccounts = accountsOnBasis(accounts, 'spendable')
    const toDisplay = (gbpValue: number) => convertAmount(gbpValue, 'GBP', fxRate)

    let cashGbp = 0
    let instantGbp = 0

    latestAccounts.forEach((account) => {
      const gbp = toGbp(account.balance_total_local ?? 0, account.currency, fxRate)
      if (account.category === 'Cash') cashGbp += gbp
      if (account.liquidity_profile === 'Instant') instantGbp += gbp
    })

    return {
      cashTotal: toDisplay(cashGbp),
      liquidTotal: toDisplay(liquidAssetsGbp(accounts, fxRate, 'spendable')),
      instantTotal: toDisplay(instantGbp),
    }
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
      <KPICard title="Total Cash" value={cashTotal} subtitle="Cash accounts" note={TRUST_EXCLUSION_LABEL} />
      <KPICard title="Liquid Assets" value={liquidTotal} subtitle="Cash + Brokerage" note={TRUST_EXCLUSION_LABEL} />
      <KPICard title="Instant Liquidity" value={instantTotal} subtitle="Instant access only" note={TRUST_EXCLUSION_LABEL} />
    </div>
  )
}
