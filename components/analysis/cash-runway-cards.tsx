'use client'

import { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { createClient } from '@/lib/supabase/client'
import { AccountBalance } from '@/lib/types'
import { AlertCircle, Wallet } from 'lucide-react'

const CASH_CATEGORIES = ['Cash', 'Checking', 'Savings']

interface CashRunwayData {
  currency: 'GBP' | 'USD'
  totalCash: number
  avgMonthlyBurn: number
  monthsOnHand: number
}

export function CashRunwayCards() {
  const [gbpData, setGbpData] = useState<CashRunwayData | null>(null)
  const [usdData, setUsdData] = useState<CashRunwayData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const supabase = createClient()

      try {
        // Fetch accounts
        const accountsResult = await supabase
          .from('account_balances')
          .select('*')
          .order('date_updated', { ascending: false })

        if (accountsResult.error) {
          throw new Error(`Failed to fetch accounts: ${accountsResult.error.message}`)
        }

        // Get latest balance for each account
        const accountsMap = new Map<string, AccountBalance>()
        accountsResult.data.forEach((account: AccountBalance) => {
          const key = `${account.institution}-${account.account_name}`
          const existing = accountsMap.get(key)
          if (!existing || new Date(account.date_updated) > new Date(existing.date_updated)) {
            accountsMap.set(key, account)
          }
        })

        const accounts = Array.from(accountsMap.values())

        // Filter to Cash/Checking/Savings accounts and sum by currency
        const cashByCurrency = { GBP: 0, USD: 0 }
        accounts.forEach((account) => {
          if (CASH_CATEGORIES.includes(account.category)) {
            const currency = account.currency.toUpperCase() as 'GBP' | 'USD'
            if (currency === 'GBP' || currency === 'USD') {
              cashByCurrency[currency] += account.balance_total_local || 0
            }
          }
        })

        // Net burn from API (last 3 full calendar months UTC; aggregated in DB — no row limit; same filters as SQL).
        const burnRes = await fetch('/api/cash-runway')
        if (!burnRes.ok) {
          throw new Error(`Failed to fetch burn: ${burnRes.status}`)
        }
        const burnJson = await burnRes.json()
        const gbpNet = Number(burnJson.gbpNet ?? 0)
        const usdNet = Number(burnJson.usdNet ?? 0)

        // Net spend is negative when expenses > refunds. Burn = max(0, -net) / 3 so refunds offset expenses.
        const gbpAvgBurn = Math.max(0, -gbpNet) / 3
        const usdAvgBurn = Math.max(0, -usdNet) / 3

        // Calculate months on hand (if no burn, set to Infinity or a large number)
        const gbpMonthsOnHand = gbpAvgBurn > 0 ? cashByCurrency.GBP / gbpAvgBurn : (cashByCurrency.GBP > 0 ? Infinity : 0)
        const usdMonthsOnHand = usdAvgBurn > 0 ? cashByCurrency.USD / usdAvgBurn : (cashByCurrency.USD > 0 ? Infinity : 0)

        setGbpData({
          currency: 'GBP',
          totalCash: cashByCurrency.GBP,
          avgMonthlyBurn: gbpAvgBurn,
          monthsOnHand: gbpMonthsOnHand,
        })

        setUsdData({
          currency: 'USD',
          totalCash: cashByCurrency.USD,
          avgMonthlyBurn: usdAvgBurn,
          monthsOnHand: usdMonthsOnHand,
        })

        setError(null)
      } catch (err) {
        console.error('Error fetching cash runway data:', err)
        setError(err instanceof Error ? err.message : 'Failed to load cash runway data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const formatCurrency = (value: number, currency: 'GBP' | 'USD') => {
    const currencySymbol = currency === 'USD' ? '$' : '£'
    const valueInK = value / 1000
    if (valueInK >= 1) {
      return `${currencySymbol}${valueInK.toFixed(1)}K`
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
        <p className="text-sm text-muted-foreground">Months of cash remaining based on average monthly spend</p>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-6">
          {/* GBP Runway Card */}
          {gbpData && (
            <div className="space-y-3 p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-blue-600" />
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
                    <span className="text-xs text-muted-foreground">Avg Burn: </span>
                    <span className="font-semibold">{formatCurrency(gbpData.avgMonthlyBurn, 'GBP')}/mo</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* USD Runway Card */}
          {usdData && (
            <div className="space-y-3 p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-green-600" />
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
                    <span className="text-xs text-muted-foreground">Avg Burn: </span>
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
