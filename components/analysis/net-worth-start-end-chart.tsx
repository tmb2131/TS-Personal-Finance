'use client'

import { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { getChartFontSizes } from '@/lib/chart-styles'
import { createClient } from '@/lib/supabase/client'
import { YoYNetWorth } from '@/lib/types'
import { Wallet, AlertCircle } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts'

const YEAR_START = 'Year Start'
const YEAR_END = 'Year End'

export function NetWorthStartEndChart() {
  const { currency } = useCurrency()
  const isMobile = useIsMobile()
  const [data, setData] = useState<YoYNetWorth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const { data: netWorthData, error } = await supabase
        .from('yoy_net_worth')
        .select('*')
        .in('category', [YEAR_START, YEAR_END])

      if (error) {
        console.error('Error fetching YoY Net Worth:', error)
        setError('Failed to load net worth data. Please try refreshing the page.')
        setLoading(false)
        return
      }

      setError(null)
      setData((netWorthData as YoYNetWorth[]) || [])
      setLoading(false)
    }

    fetchData()
  }, [currency])

  const chartData = useMemo(() => {
    if (data.length === 0) return []

    const currentYear = new Date().getFullYear()
    const priorYear = currentYear - 1

    const yearStartItem = data.find((item) => item.category === YEAR_START)
    const yearEndItem = data.find((item) => item.category === YEAR_END)

    const getAmount = (item: YoYNetWorth | undefined) => {
      if (!item) return 0
      return currency === 'USD' ? (item.amount_usd ?? 0) : (item.amount_gbp ?? 0)
    }

    const rows: { name: string; value: number; label: string }[] = []

    if (yearStartItem) {
      rows.push({
        name: `Dec 31, ${priorYear}`,
        value: getAmount(yearStartItem),
        label: `Year start (Dec 31, ${priorYear})`,
      })
    }
    if (yearEndItem) {
      rows.push({
        name: `Dec 31, ${currentYear}`,
        value: getAmount(yearEndItem),
        label: `Year end (Dec 31, ${currentYear})`,
      })
    }

    return rows
  }, [data, currency])

  const symbol = currency === 'USD' ? '$' : '£'
  const formatAsMillions = (value: number) => {
    const abs = Math.abs(value)
    const m = abs / 1_000_000
    const s = value < 0 ? '-' : ''
    return `${s}${symbol}${m.toFixed(1)}M`
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <Skeleton className="h-6 w-48" />
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
          <CardTitle className="text-xl">Net Worth: Year Start vs Year End</CardTitle>
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

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Net Worth: Year Start vs Year End</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Wallet}
            title="No net worth data available"
            description="Year start and year end data has not been synced yet. Please refresh the data to load this chart."
          />
        </CardContent>
      </Card>
    )
  }

  const barColors = ['#6366f1', '#1d4ed8'] // Start = indigo, End = darker blue (factual, not "good")
  const fontSizes = getChartFontSizes(isMobile)

  return (
    <Card>
      <CardHeader className="bg-muted/50">
        <CardTitle className="text-xl">Net Worth: Year Start vs Year End</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Starting (prior year-end) and ending net worth for the current year
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={chartData}
            margin={{ top: 36, right: 30, left: 20, bottom: 24 }}
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
              tickFormatter={formatAsMillions}
              tick={{ fontSize: fontSizes.axisTick }}
              stroke="#6b7280"
              width={isMobile ? 48 : 60}
            />
            <Tooltip
              formatter={(value: number) => formatAsMillions(value)}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ''}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: fontSizes.tooltipMin,
              }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} stroke="#fff" strokeWidth={1} minPointSize={8}>
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={barColors[index % barColors.length]} />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                formatter={(v: number) => formatAsMillions(v)}
                style={{ fontSize: fontSizes.axisTick, fill: '#374151' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
