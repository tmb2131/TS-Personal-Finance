'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AccountBalance, Debt } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
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

type LiquidityLevel = 'cash' | 'liquid' | 'instant'

export default function CommittedCapitalVsCash() {
  const { currency, convertAmount, fxRate } = useCurrency()
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(true)
  const [selectedLevel, setSelectedLevel] = useState<LiquidityLevel>('liquid')
  const [committedCapital, setCommittedCapital] = useState(0)
  const [liquidityAmounts, setLiquidityAmounts] = useState({
    cash: 0,
    liquid: 0,
    instant: 0,
  })

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

      setCommittedCapital(totalCommitted)

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
      let liquid = 0
      let instant = 0

      latestAccounts.forEach((account) => {
        const amount = convertAmount(
          account.balance_total_local ?? 0,
          account.currency ?? 'USD',
          fxRate
        )

        if (
          account.liquidity_profile === 'High' ||
          account.category === 'Cash'
        ) {
          cash += amount
        }

        if (
          account.liquidity_profile === 'High' ||
          account.liquidity_profile === 'Medium'
        ) {
          liquid += amount
        }

        if (account.liquidity_profile === 'High') {
          instant += amount
        }
      })

      setLiquidityAmounts({ cash, liquid, instant })
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

  const chartData = [
    { name: 'Committed Capital', value: committedCapital, color: '#ef4444' },
    {
      name:
        selectedLevel === 'cash'
          ? 'Cash'
          : selectedLevel === 'liquid'
            ? 'Liquid'
            : 'Instant',
      value: liquidityAmounts[selectedLevel],
      color: '#10b981',
    },
  ]

  const fontSizes = getChartFontSizes(isMobile)
  const chartHeight = isMobile ? 260 : 320

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Committed Capital vs. Cash</CardTitle>
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle>Committed Capital vs. Cash</CardTitle>
          <div className="flex gap-2">
            <Button
              variant={selectedLevel === 'cash' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedLevel('cash')}
            >
              Cash
            </Button>
            <Button
              variant={selectedLevel === 'liquid' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedLevel('liquid')}
            >
              Liquid
            </Button>
            <Button
              variant={selectedLevel === 'instant' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedLevel('instant')}
            >
              Instant
            </Button>
          </div>
        </div>
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
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: fontSizes.axisTick }}
              stroke="#6b7280"
            />
            <YAxis
              tickFormatter={formatCurrency}
              tick={{ fontSize: fontSizes.axisTick }}
              width={isMobile ? 48 : 60}
              stroke="#6b7280"
            />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{
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
      </CardContent>
    </Card>
  )
}
