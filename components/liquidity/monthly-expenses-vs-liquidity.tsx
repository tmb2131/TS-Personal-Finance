'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AccountBalance } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { useChartTheme } from '@/lib/hooks/use-chart-theme'
import { getChartFontSizes } from '@/lib/chart-styles'
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
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState<
    Array<{ name: string; value: number; color: string }>
  >([])

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const supabase = createClient()

      // Fetch monthly expenses from cash-runway API
      const burnRes = await fetch('/api/cash-runway', { credentials: 'include' })
      const burnJson = await burnRes.json()

      const monthlyExpenses =
        currency === 'USD'
          ? Math.max(0, -Number(burnJson.usdNet ?? 0)) / 3
          : Math.max(0, -Number(burnJson.gbpNet ?? 0)) / 3

      // Fetch account balances
      const { data: accounts } = await supabase
        .from('account_balances')
        .select('*')
        .order('date_updated', { ascending: false })

      if (!accounts) {
        setLoading(false)
        return
      }

      // Deduplicate accounts
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

      // Calculate liquidity totals
      let cashTotal = 0
      let liquidTotal = 0
      let instantTotal = 0

      latestAccounts.forEach((account) => {
        const amount = convertAmount(
          account.balance_total_local ?? 0,
          account.currency ?? 'USD',
          fxRate
        )

        // Cash: Cash category
        if (account.category === 'Cash') {
          cashTotal += amount
        }

        // Liquid: Cash + Brokerage categories
        if (account.category === 'Cash' || account.category === 'Brokerage') {
          liquidTotal += amount
        }

        // Instant: Instant liquidity profile
        if (account.liquidity_profile === 'Instant') {
          instantTotal += amount
        }
      })

      const data = [
        { name: 'Monthly Expenses', value: monthlyExpenses, color: '#3b82f6' },
        { name: 'Cash', value: cashTotal, color: '#10b981' },
        { name: 'Instant', value: instantTotal, color: '#34d399' },
        { name: 'Liquid', value: liquidTotal, color: '#22c55e' },
      ]

      setChartData(data)
      setLoading(false)
    }

    fetchData()
  }, [currency, convertAmount, fxRate])

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
          <div
            className="flex items-center justify-center"
            style={{ height: chartHeight }}
          >
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
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
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{
                backgroundColor: chartTheme.tooltipBg,
                borderColor: chartTheme.tooltipBorder,
                color: chartTheme.tooltipText,
                fontSize: `${fontSizes.tooltipMin}px`,
              }}
            />
            <Bar dataKey="value">
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2">
          Monthly Expenses = avg net spend over last 3 full months (excl. income &amp; gifts)
        </p>
      </CardContent>
    </Card>
  )
}
