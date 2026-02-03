'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { getChartFontSizes } from '@/lib/chart-styles'
import { createClient } from '@/lib/supabase/client'
import { HistoricalNetWorth, TransactionLog } from '@/lib/types'
import { AlertCircle, TrendingUp } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts'

// Waterfall bar colors - using app's design system palette
const START_END_FILL = '#6b7280' // Gray for start/end (neutral)
const INCOME_FILL = '#22c55e' // Green-500 (matches app's positive/growth color)
const GAINS_FILL = '#16a34a' // Green-600 (darker green for investment gains)
const EXPENSES_FILL = '#ef4444' // Red-500 (matches app's negative color)

export function YoYWaterfallChart() {
  const { currency } = useCurrency()
  const isMobile = useIsMobile()
  const fontSizes = getChartFontSizes(isMobile)
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      
      const currentYear = new Date().getFullYear()
      const startOfYear = new Date(currentYear, 0, 1)
      
      const [netWorthResult, transactionsResult] = await Promise.all([
        supabase
          .from('historical_net_worth')
          .select('*')
          .gte('date', startOfYear.toISOString())
          .order('date', { ascending: true }),
        supabase
          .from('transaction_log')
          .select('*')
          .gte('date', startOfYear.toISOString())
          .order('date', { ascending: true }),
      ])

      if (netWorthResult.error || transactionsResult.error) {
        const errorMsg = netWorthResult.error?.message || transactionsResult.error?.message || 'Failed to load data'
        console.error('Error fetching YoY data:', netWorthResult.error || transactionsResult.error)
        setError(errorMsg)
        setLoading(false)
        return
      }

      // Calculate start net worth (Jan 1)
      const startNW = netWorthResult.data
        .filter((nw: HistoricalNetWorth) => {
          const date = new Date(nw.date)
          return date.getMonth() === 0 && date.getDate() === 1
        })
        .reduce((sum: number, nw: HistoricalNetWorth) => {
          const amount = currency === 'USD' ? nw.amount_usd : nw.amount_gbp
          return sum + (amount || 0)
        }, 0)

      // Calculate current net worth
      const currentNW = netWorthResult.data
        .slice(-1)[0]
        ? (currency === 'USD' 
            ? (netWorthResult.data.slice(-1)[0] as HistoricalNetWorth).amount_usd 
            : (netWorthResult.data.slice(-1)[0] as HistoricalNetWorth).amount_gbp) || 0
        : startNW

      // Calculate income (positive transactions)
      const income = transactionsResult.data
        .filter((t: TransactionLog) => {
          const amount = currency === 'USD' ? t.amount_usd : t.amount_gbp
          return amount && amount > 0
        })
        .reduce((sum: number, t: TransactionLog) => {
          const amount = currency === 'USD' ? t.amount_usd : t.amount_gbp
          return sum + (amount || 0)
        }, 0)

      // Calculate expenses (negative transactions)
      const expenses = Math.abs(
        transactionsResult.data
          .filter((t: TransactionLog) => {
            const amount = currency === 'USD' ? t.amount_usd : t.amount_gbp
            return amount && amount < 0
          })
          .reduce((sum: number, t: TransactionLog) => {
            const amount = currency === 'USD' ? t.amount_usd : t.amount_gbp
            return sum + (amount || 0)
          }, 0)
      )

      // Calculate investment gains (net worth change minus income/expenses)
      const investmentGains = currentNW - startNW - income + expenses

      const waterfallData = [
        { name: 'Start (Jan 1)', value: startNW, type: 'start' },
        { name: 'Income', value: income, type: 'income' },
        { name: 'Expenses', value: -expenses, type: 'expenses' },
        { name: 'Investment Gains', value: investmentGains, type: 'gains' },
        { name: 'End (Current)', value: currentNW, type: 'end' },
      ]

      setData(waterfallData)
      setError(null)
      setLoading(false)
    }

    fetchData()
  }, [currency])

  const getBarColor = (type: string) => {
    switch (type) {
      case 'start':
      case 'end':
        return START_END_FILL
      case 'income':
        return INCOME_FILL
      case 'gains':
        return GAINS_FILL
      case 'expenses':
        return EXPENSES_FILL
      default:
        return START_END_FILL
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <Skeleton className="h-6 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-80 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Year-over-Year Net Worth Change</CardTitle>
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

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Year-over-Year Net Worth Change</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={TrendingUp}
            title="No data available"
            description="Year-over-year net worth data has not been synced yet. Please refresh the data to load this chart."
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="bg-muted/50">
        <CardTitle className="text-xl">Year-over-Year Net Worth Change</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={isMobile ? 260 : 320}>
          <BarChart
            data={data}
            margin={isMobile ? { top: 10, right: 10, left: 0, bottom: 5 } : { top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: fontSizes.axisTick }}
              stroke="#6b7280"
              tickCount={isMobile ? 5 : undefined}
              interval={isMobile ? 'preserveStartEnd' : undefined}
            />
            <YAxis
              tickFormatter={(value) =>
                new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: currency,
                  notation: 'compact',
                  maximumFractionDigits: 0,
                }).format(value)
              }
              tick={{ fontSize: fontSizes.axisTick }}
              stroke="#6b7280"
              width={isMobile ? 60 : 80}
            />
            <Tooltip
              formatter={(value: number) =>
                new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: currency,
                }).format(value)
              }
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: isMobile ? '6px 10px' : '8px 12px',
                fontSize: `${fontSizes.tooltipMin}px`,
              }}
            />
            <Legend
              wrapperStyle={{
                paddingTop: isMobile ? '10px' : '20px',
                fontSize: fontSizes.legend,
              }}
              iconType="square"
              iconSize={fontSizes.iconSize}
              formatter={(value) => (
                <span style={{ fontSize: fontSizes.legend, marginRight: isMobile ? '16px' : '24px' }}>
                  {value}
                </span>
              )}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} stroke="#fff" strokeWidth={1}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.type)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
