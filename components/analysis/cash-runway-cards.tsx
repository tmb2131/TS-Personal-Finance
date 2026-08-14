'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TRUST_EXCLUSION_LABEL } from '@/lib/trust-exclusions'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useAccounts } from '@/lib/hooks/queries/use-accounts'
import { useCashRunway } from '@/lib/hooks/queries/use-cash-runway'
import { AccountBalance } from '@/lib/types'
import { AlertCircle } from 'lucide-react'

const CASH_CATEGORIES = ['Cash', 'Checking', 'Savings']

export function CashRunwayCards() {
  const {
    data: accounts,
    isLoading: accountsLoading,
    error: accountsError,
  } = useAccounts()
  const {
    data: cashRunway,
    isLoading: cashRunwayLoading,
    error: cashRunwayError,
  } = useCashRunway()

  const loading = accountsLoading || cashRunwayLoading

  const queryError = accountsError ?? cashRunwayError
  const error =
    queryError == null
      ? null
      : queryError instanceof Error
        ? queryError.message
        : 'Failed to load cash runway data'

  const { gbpData, usdData } = useMemo(() => {
    const accountsList = accounts ?? []
    const accountsMap = new Map<string, AccountBalance>()
    accountsList.forEach((account: AccountBalance) => {
      const key = `${account.institution}-${account.account_name}`
      const existing = accountsMap.get(key)
      if (!existing || new Date(account.date_updated) > new Date(existing.date_updated)) {
        accountsMap.set(key, account)
      }
    })

    const latestAccounts = Array.from(accountsMap.values())

    const cashByCurrency = { GBP: 0, USD: 0 }
    latestAccounts.forEach((account) => {
      if (CASH_CATEGORIES.includes(account.category)) {
        const currency = account.currency.toUpperCase() as 'GBP' | 'USD'
        if (currency === 'GBP' || currency === 'USD') {
          cashByCurrency[currency] += account.balance_total_local || 0
        }
      }
    })

    const burnJson = cashRunway ?? {}
    const gbpNet = Number(burnJson.gbpNet ?? 0)
    const usdNet = Number(burnJson.usdNet ?? 0)

    const gbpAvgBurn = Math.max(0, -gbpNet) / 3
    const usdAvgBurn = Math.max(0, -usdNet) / 3

    const gbpMonthsOnHand =
      gbpAvgBurn > 0 ? cashByCurrency.GBP / gbpAvgBurn : cashByCurrency.GBP > 0 ? Infinity : 0
    const usdMonthsOnHand =
      usdAvgBurn > 0 ? cashByCurrency.USD / usdAvgBurn : cashByCurrency.USD > 0 ? Infinity : 0

    return {
      gbpData: {
        currency: 'GBP' as const,
        totalCash: cashByCurrency.GBP,
        avgMonthlyBurn: gbpAvgBurn,
        monthsOnHand: gbpMonthsOnHand,
      },
      usdData: {
        currency: 'USD' as const,
        totalCash: cashByCurrency.USD,
        avgMonthlyBurn: usdAvgBurn,
        monthsOnHand: usdMonthsOnHand,
      },
    }
  }, [accounts, cashRunway])

  const formatCurrency = (value: number, currency: 'GBP' | 'USD') => {
    const currencySymbol = currency === 'USD' ? '$' : '£'
    const valueInK = value / 1000
    if (valueInK >= 1) {
      return `${currencySymbol}${valueInK.toFixed(1)}k`
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatMonths = (months: number) => {
    if (months === Infinity || !isFinite(months)) {
      return '∞ Months'
    }
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
          <EmptyState
            icon={AlertCircle}
            title="Error loading data"
            description={error}
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash Runway</CardTitle>
        <p className="text-body text-muted-foreground">Months of cash remaining based on average monthly spend</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid md:grid-cols-2 gap-6">
          {[
            { label: 'GBP Runway', data: gbpData, code: 'GBP' as const },
            { label: 'USD Runway', data: usdData, code: 'USD' as const },
          ]
            .filter((entry) => entry.data)
            .map(({ label, data, code }) => (
              <div key={code} className="space-y-3 rounded-lg border bg-card p-4">
                <h3 className="text-meta font-semibold uppercase tracking-wide">{label}</h3>
                <div className="space-y-2">
                  <div>
                    <p className="text-meta text-muted-foreground mb-1">Months on Hand</p>
                    <p className="figure text-figure">{formatMonths(data!.monthsOnHand)}</p>
                  </div>
                  <div className="space-y-1 border-t pt-2">
                    <p className="text-body">
                      <span className="text-meta text-muted-foreground">Total Cash: </span>
                      <span className="num font-semibold">{formatCurrency(data!.totalCash, code)}</span>
                    </p>
                    <p className="text-body">
                      <span className="text-meta text-muted-foreground">Avg Monthly Spend: </span>
                      <span className="num font-semibold">
                        {formatCurrency(data!.avgMonthlyBurn, code)}/mo
                      </span>
                    </p>
                  </div>
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
