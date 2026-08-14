'use client'

import { useMemo } from 'react'
import { useAccounts } from '@/lib/hooks/queries/use-accounts'
import { useCashRunway } from '@/lib/hooks/queries/use-cash-runway'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrency } from '@/lib/contexts/currency-context'
import { TRUST_EXCLUSION_LABEL } from '@/lib/trust-exclusions'
import { accountsOnBasis, liquidAssetsGbp, toGbp } from '@/lib/account-totals'
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
    // Same denominator as the Runway cards: one GBP burn, restated for display.
    // This previously picked the GBP-only or USD-only burn depending on the
    // currency toggle, so the bar changed meaning when you flipped the header.
    const monthlyExpenses = convertAmount(Number(cashRunway?.monthlyBurnGbp ?? 0), 'GBP', fxRate)

    const accountsList = accounts ?? []
    const latestAccounts = accountsOnBasis(accountsList, 'spendable')
    const toDisplay = (gbpValue: number) => convertAmount(gbpValue, 'GBP', fxRate)

    let cashGbp = 0
    let instantGbp = 0

    latestAccounts.forEach((account) => {
      const gbp = toGbp(account.balance_total_local ?? 0, account.currency, fxRate)
      if (account.category === 'Cash') cashGbp += gbp
      if (account.liquidity_profile === 'Instant') instantGbp += gbp
    })

    const cashTotal = toDisplay(cashGbp)
    const instantTotal = toDisplay(instantGbp)
    // Same `liquid` as every other surface: Cash + Brokerage, trust excluded.
    const liquidTotal = toDisplay(liquidAssetsGbp(accountsList, fxRate, 'spendable'))

    return [
      { name: 'Monthly Expenses', value: monthlyExpenses, color: 'hsl(var(--chart-1))' },
      { name: 'Cash', value: cashTotal, color: 'hsl(var(--positive))' },
      { name: 'Instant', value: instantTotal, color: 'hsl(var(--positive) / 0.6)' },
      { name: 'Liquid', value: liquidTotal, color: 'hsl(var(--positive))' },
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
