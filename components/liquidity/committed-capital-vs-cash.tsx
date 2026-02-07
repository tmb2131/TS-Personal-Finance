'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AccountBalance, Debt } from '@/lib/types'
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

export default function CommittedCapitalVsCash() {
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

      // Fetch committed capital
      const { data: commitments } = await supabase
        .from('debt')
        .select('*')
        .eq('type', 'Committed Capital')

      const totalCommitted =
        commitments?.reduce((sum, item: Debt) => {
          const amount = (currency === 'USD' ? item.amount_usd : item.amount_gbp) ?? 0
          return sum + amount
        }, 0) ?? 0

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
      let cash = 0
      let instant = 0
      let within6Months = 0

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

        // Instant: Instant liquidity profile
        if (account.liquidity_profile === 'Instant') {
          instant += amount
        }

        // Within 6 Months: Within 6 Months liquidity profile
        if (account.liquidity_profile === 'Within 6 Months') {
          within6Months += amount
        }
      })

      const data = [
        { name: 'Committed Capital', value: totalCommitted, color: '#ef4444' },
        { name: 'Cash', value: cash, color: '#10b981' },
        { name: 'Instant', value: instant, color: '#34d399' },
        { name: 'Within 6 Months', value: within6Months, color: '#3b82f6' },
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
          <CardTitle>Committed Capital vs. Liquidity</CardTitle>
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
        <CardTitle>Committed Capital vs. Liquidity</CardTitle>
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
          Cash = Cash category (may overlap with Instant). Instant &amp; Within 6 Months = liquidity profile (no overlap).
        </p>
      </CardContent>
    </Card>
  )
}
