'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TRUST_EXCLUSION_LABEL } from '@/lib/trust-exclusions'
import { cashInCurrency, totalCashGbp } from '@/lib/account-totals'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useAccounts } from '@/lib/hooks/queries/use-accounts'
import { useCashRunway } from '@/lib/hooks/queries/use-cash-runway'
import { useCurrency } from '@/lib/contexts/currency-context'
import { AlertCircle } from 'lucide-react'

/**
 * Two framings of one runway, not two runways.
 *
 * The previous card divided GBP cash by GBP-denominated spend and USD cash by
 * USD-denominated spend, then showed both at equal weight. The dollar figure
 * (54.7 months) was an artefact of which counterparties bill in dollars, not a
 * fact about liquidity — the household spends in sterling and the dollar
 * balances are sterling-in-waiting.
 *
 * Both cards below divide by the same denominator: the trailing-12-month mean
 * of all expense cash flow, in GBP. Only the numerator changes, and the
 * difference between them is exactly the question "what if I converted?".
 */
export function CashRunwayCards() {
  const { fxRate } = useCurrency()
  const {
    data: accounts,
    isLoading: accountsLoading,
    error: accountsError,
  } = useAccounts()
  const {
    data: burn,
    isLoading: burnLoading,
    error: burnError,
  } = useCashRunway()

  const loading = accountsLoading || burnLoading

  const queryError = accountsError ?? burnError
  const error =
    queryError == null
      ? null
      : queryError instanceof Error
        ? queryError.message
        : 'Failed to load cash runway data'

  const { monthlyBurnGbp, sterlingCashGbp, allCashGbp, usdCashLocal } = useMemo(() => {
    const accountsList = accounts ?? []
    return {
      monthlyBurnGbp: Number(burn?.monthlyBurnGbp ?? 0),
      sterlingCashGbp: cashInCurrency(accountsList, 'GBP', 'spendable'),
      allCashGbp: totalCashGbp(accountsList, fxRate, 'spendable'),
      usdCashLocal: cashInCurrency(accountsList, 'USD', 'spendable'),
    }
  }, [accounts, burn, fxRate])

  const monthsOnHand = (cashGbp: number) => {
    if (monthlyBurnGbp > 0) return cashGbp / monthlyBurnGbp
    return cashGbp > 0 ? Infinity : 0
  }

  const formatGbp = (value: number) => {
    const valueInK = value / 1000
    if (Math.abs(valueInK) >= 1) return `£${valueInK.toFixed(1)}k`
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatUsd = (value: number) => {
    const valueInK = value / 1000
    if (Math.abs(valueInK) >= 1) return `$${valueInK.toFixed(1)}k`
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatMonths = (months: number) => {
    if (!isFinite(months)) return '∞ Months'
    return `${months.toFixed(1)} Months`
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cash Runway</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cash Runway</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={AlertCircle} title="Error loading data" description={error} />
        </CardContent>
      </Card>
    )
  }

  const cards = [
    {
      key: 'sterling',
      label: 'Sterling runway',
      months: monthsOnHand(sterlingCashGbp),
      cashLabel: 'GBP cash',
      cashValue: formatGbp(sterlingCashGbp),
      note: 'The operational constraint: sterling on hand against sterling spend.',
    },
    {
      key: 'converted',
      label: 'Runway if converted',
      months: monthsOnHand(allCashGbp),
      cashLabel: 'All cash, converted',
      cashValue: formatGbp(allCashGbp),
      note: `Includes ${formatUsd(usdCashLocal)} of USD cash at today's rate. Converting is a decision with an FX-timing cost, not a free operation.`,
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash Runway</CardTitle>
        <p className="text-body text-muted-foreground">
          Months of cash remaining at {formatGbp(monthlyBurnGbp)}/mo — the trailing
          {' '}
          {burn?.months ?? 12}-month mean of all spending, in sterling.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid md:grid-cols-2 gap-6">
          {cards.map((card) => (
            <div key={card.key} className="space-y-3 rounded-lg border bg-card p-4">
              <h3 className="text-meta font-semibold uppercase tracking-wide">{card.label}</h3>
              <div className="space-y-2">
                <div>
                  <p className="text-meta text-muted-foreground mb-1">Months on Hand</p>
                  <p className="figure text-figure">{formatMonths(card.months)}</p>
                </div>
                <div className="space-y-1 border-t pt-2">
                  <p className="text-body">
                    <span className="text-meta text-muted-foreground">{card.cashLabel}: </span>
                    <span className="num font-semibold">{card.cashValue}</span>
                  </p>
                  <p className="text-body">
                    <span className="text-meta text-muted-foreground">Monthly spend: </span>
                    <span className="num font-semibold">{formatGbp(monthlyBurnGbp)}/mo</span>
                  </p>
                </div>
                <p className="text-meta text-muted-foreground">{card.note}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-meta text-muted-foreground">
          {TRUST_EXCLUSION_LABEL}. Non-cash valuation entries are excluded from the burn.
        </p>
      </CardContent>
    </Card>
  )
}
