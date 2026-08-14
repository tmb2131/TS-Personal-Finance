'use client'

import { useMemo } from 'react'
import { useAccounts } from '@/lib/hooks/queries/use-accounts'
import { useCashRunway } from '@/lib/hooks/queries/use-cash-runway'
import { AccountBalance } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrency } from '@/lib/contexts/currency-context'
import { excludeTrustAccounts, TRUST_EXCLUSION_LABEL } from '@/lib/trust-exclusions'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { useChartTheme } from '@/lib/hooks/use-chart-theme'
import { getChartFontSizes, getChartTooltipContentStyle, getChartTooltipWrapperStyle } from '@/lib/chart-styles'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

export default function MonthlyExpensesVsLiquidity() {
  const { currency, convertAmount, fxRate } = useCurrency()
  const isMobile = useIsMobile()
  const chartTheme = useChartTheme()
  const { data: accounts, isLoading: accountsLoading } = useAccounts()
  const { data: cashRunway, isLoading: cashRunwayLoading } = useCashRunway()
  const loading = accountsLoading || cashRunwayLoading

  const chartData = useMemo(() => {
    const burnJson = cashRunway ?? {}
    const monthlyExpenses =
      currency === 'USD'
        ? Math.max(0, -Number(burnJson.usdNet ?? 0)) / 3
        : Math.max(0, -Number(burnJson.gbpNet ?? 0)) / 3

    const accountsList = accounts ?? []
    const accountsMap = new Map<string, AccountBalance>()
    accountsList.forEach((account) => {
      const key = `${account.institution}-${account.account_name}`
      const existing = accountsMap.get(key)
      if (
        !existing ||
        new Date(account.date_updated) > new Date(existing.date_updated)
      ) {
        accountsMap.set(key, account)
      }
    })

    const latestAccounts = excludeTrustAccounts(Array.from(accountsMap.values()))

    let cashTotal = 0
    let liquidTotal = 0
    let instantTotal = 0

    latestAccounts.forEach((account) => {
      const amount = convertAmount(
        account.balance_total_local ?? 0,
        account.currency ?? 'USD',
        fxRate
      )

      if (account.category === 'Cash') {
        cashTotal += amount
      }

      if (account.category === 'Cash' || account.category === 'Brokerage') {
        liquidTotal += amount
      }

      if (account.liquidity_profile === 'Instant') {
        instantTotal += amount
      }
    })

    return [
      { name: 'Monthly Expenses', value: monthlyExpenses, color: '#3b82f6' },
      { name: 'Cash', value: cashTotal, color: '#10b981' },
      { name: 'Instant', value: instantTotal, color: '#34d399' },
      { name: 'Liquid', value: liquidTotal, color: '#22c55e' },
    ]
  }, [currency, convertAmount, fxRate, accounts, cashRunway])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const fontSizes = getChartFontSizes(isMobile)
  const chartHeight = isMobile ? 260 : 320

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monthly Expenses vs. Liquidity</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="w-full" style={{ height: chartHeight }} aria-label="Loading chart" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Expenses vs. Liquidity</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={chartData}
            margin={
              isMobile
                ? { top: 10, right: 10, left: 0, bottom: 5 }
                : { top: 20, right: 30, left: 20, bottom: 5 }
            }
          >
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: fontSizes.axisTick, fill: chartTheme.labelFill }}
              stroke={chartTheme.axisStroke}
            />
            <YAxis
              tickFormatter={formatCurrency}
              tick={{ fontSize: fontSizes.axisTick, fill: chartTheme.labelFill }}
              width={isMobile ? 48 : 60}
              stroke={chartTheme.axisStroke}
            />
            <Tooltip
              wrapperStyle={getChartTooltipWrapperStyle(chartTheme)}
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={getChartTooltipContentStyle(chartTheme, { fontSize: fontSizes.tooltipMin, isMobile })}
            />
            <Bar dataKey="value">
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-meta text-muted-foreground mt-2">
          Monthly Expenses = avg net spend over last 3 full months (excl. income &amp; gifts).{' '}
          {TRUST_EXCLUSION_LABEL}.
        </p>
      </CardContent>
    </Card>
  )
}
