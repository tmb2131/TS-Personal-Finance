'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AccountBalance } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { getChartFontSizes } from '@/lib/chart-styles'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts'

const COLORS: Record<string, string> = {
  Instant: '#10b981', // Emerald-500
  'Within 6 Months': '#3b82f6', // Blue-500
  'Locked Up': '#64748b', // Slate-500
  Unknown: '#94a3b8', // Slate-300
}

export default function LiquidityDistribution() {
  const { currency, convertAmount, fxRate } = useCurrency()
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState<
    Array<{ name: string; value: number }>
  >([])

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const supabase = createClient()

      const { data: accounts } = await supabase
        .from('account_balances')
        .select('*')
        .order('date_updated', { ascending: false })

      if (!accounts) {
        setLoading(false)
        return
      }

      // Deduplicate by institution + account_name
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

      // Group by liquidity profile
      const liquidityGroups: Record<string, number> = {}

      latestAccounts.forEach((account) => {
        const profile = account.liquidity_profile || 'Unknown'
        const amount = convertAmount(
          account.balance_total_local ?? 0,
          account.currency ?? 'USD',
          fxRate
        )
        liquidityGroups[profile] = (liquidityGroups[profile] ?? 0) + amount
      })

      // Convert to chart data and filter out zero values
      const data = Object.entries(liquidityGroups)
        .filter(([_, value]) => value > 0)
        .map(([name, value]) => ({
          name,
          value,
        }))
        .sort((a, b) => b.value - a.value)

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
          <CardTitle>Liquidity Distribution</CardTitle>
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

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Liquidity Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex items-center justify-center"
            style={{ height: chartHeight }}
          >
            <p className="text-sm text-muted-foreground">No data available</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Liquidity Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) =>
                `${name}: ${(percent * 100).toFixed(0)}%`
              }
              outerRadius={isMobile ? 70 : 90}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[entry.name] || COLORS.Unknown}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{
                fontSize: `${fontSizes.tooltipMin}px`,
              }}
            />
            <Legend
              wrapperStyle={{
                fontSize: `${fontSizes.legend}px`,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
