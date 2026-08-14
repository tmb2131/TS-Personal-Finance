'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useAccounts } from '@/lib/hooks/queries/use-accounts'
import { useCashRunway } from '@/lib/hooks/queries/use-cash-runway'
import { AccountBalance } from '@/lib/types'
import { AlertCircle, Wallet } from 'lucide-react'

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
      <Card className="">
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
      <Card className="">
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
    <Card className="">
      <CardHeader>
        <CardTitle>Cash Runway</CardTitle>
        <p className="text-sm text-muted-foreground">Months of cash remaining based on average monthly spend</p>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-6">
          {/* GBP Runway Card */}
          {gbpData && (
            <div className="space-y-3 p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                  <Wallet className="h-5 w-5 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-sm uppercase tracking-wide">GBP Runway</h3>
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Months on Hand</p>
                  <p className="text-2xl font-bold tabular-nums">{formatMonths(gbpData.monthsOnHand)}</p>
                </div>
                <div className="space-y-1 pt-2 border-t">
                  <p className="text-sm">
                    <span className="text-xs text-muted-foreground">Total Cash: </span>
                    <span className="font-semibold">{formatCurrency(gbpData.totalCash, 'GBP')}</span>
                  </p>
                  <p className="text-sm">
                    <span className="text-xs text-muted-foreground">Avg Monthly Spend: </span>
                    <span className="font-semibold">{formatCurrency(gbpData.avgMonthlyBurn, 'GBP')}/mo</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* USD Runway Card */}
          {usdData && (
            <div className="space-y-3 p-4 rounded-lg border border-l-[3px] border-l-positive bg-card">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-positive-tint">
                  <Wallet className="h-5 w-5 text-positive" />
                </div>
                <h3 className="font-semibold text-sm uppercase tracking-wide">USD Runway</h3>
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Months on Hand</p>
                  <p className="text-2xl font-bold tabular-nums">{formatMonths(usdData.monthsOnHand)}</p>
                </div>
                <div className="space-y-1 pt-2 border-t">
                  <p className="text-sm">
                    <span className="text-xs text-muted-foreground">Total Cash: </span>
                    <span className="font-semibold">{formatCurrency(usdData.totalCash, 'USD')}</span>
                  </p>
                  <p className="text-sm">
                    <span className="text-xs text-muted-foreground">Avg Monthly Spend: </span>
                    <span className="font-semibold">{formatCurrency(usdData.avgMonthlyBurn, 'USD')}/mo</span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
