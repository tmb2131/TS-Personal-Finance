'use client'

import { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { useChartTheme } from '@/lib/hooks/use-chart-theme'
import { getChartFontSizes, getChartTooltipContentStyle, getChartTooltipWrapperStyle } from '@/lib/chart-styles'
import { createClient } from '@/lib/supabase/client'
import { YoYNetWorth, YoYBridgeMeta } from '@/lib/types'
import { formatYoYBridgeSubtitle, parseYoYBridgeMeta } from '@/lib/yoy-bridge-ui'
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
  const chartTheme = useChartTheme()
  const [data, setData] = useState<YoYNetWorth[]>([])
  const [bridgeMeta, setBridgeMeta] = useState<YoYBridgeMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const [netWorthResult, metaResult] = await Promise.all([
        supabase.from('yoy_net_worth').select('*').in('category', [YEAR_START, YEAR_END]),
        supabase.from('sync_metadata').select('yoy_bridge_meta').maybeSingle(),
      ])

      if (netWorthResult.error) {
        console.error('Error fetching YoY Net Worth:', netWorthResult.error)
        setError('Failed to load net worth data. Please try refreshing the page.')
        setLoading(false)
        return
      }

      setError(null)
      setData((netWorthResult.data as YoYNetWorth[]) || [])
      if (!metaResult.error) {
        setBridgeMeta(parseYoYBridgeMeta(metaResult.data?.yoy_bridge_meta))
      } else {
        setBridgeMeta(null)
      }
      setLoading(false)
    }

    fetchData()
  }, [currency])

  const bridgeSubtitle = formatYoYBridgeSubtitle(bridgeMeta)

  const chartData = useMemo(() => {
    if (data.length === 0) return []

    const yearStartItem = data.find((item) => item.category === YEAR_START)
    const yearEndItem = data.find((item) => item.category === YEAR_END)

    const getAmount = (item: YoYNetWorth | undefined) => {
      if (!item) return 0
      return currency === 'USD' ? (item.amount_usd ?? 0) : (item.amount_gbp ?? 0)
    }

    const rows: { name: string; value: number; label: string }[] = []

    if (yearStartItem) {
      rows.push({
        name: 'Year Start',
        value: getAmount(yearStartItem),
        label: 'Prior year-end net worth',
      })
    }
    if (yearEndItem) {
      rows.push({
        name: 'Forecast Dec 31',
        value: getAmount(yearEndItem),
        label: 'Forecast Dec 31 net worth',
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
        <CardHeader>
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
        <CardHeader>
          <CardTitle>Net Worth: Prior Year-End vs Forecast</CardTitle>
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
        <CardHeader>
          <CardTitle>Net Worth: Prior Year-End vs Forecast</CardTitle>
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

  const barColors = ['hsl(var(--chart-2))', 'hsl(var(--chart-1))'] // Start = indigo, End = darker blue (factual, not "good")
  const fontSizes = getChartFontSizes(isMobile)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Net Worth: Prior Year-End vs Forecast</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          {bridgeSubtitle ?? 'Prior year-end net worth compared with forecast Dec 31 net worth'}
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={isMobile ? 260 : 320}>
          <BarChart
            data={chartData}
            margin={isMobile ? { top: 10, right: 10, left: 0, bottom: 5 } : { top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: fontSizes.axisTick, fill: chartTheme.labelFill }}
              stroke={chartTheme.axisStroke}
              tickCount={isMobile ? 5 : undefined}
              interval={isMobile ? 'preserveStartEnd' : undefined}
            />
            <YAxis
              tickFormatter={formatAsMillions}
              tick={{ fontSize: fontSizes.axisTick, fill: chartTheme.labelFill }}
              stroke={chartTheme.axisStroke}
              width={isMobile ? 48 : 60}
            />
            <Tooltip
              wrapperStyle={getChartTooltipWrapperStyle(chartTheme)}
              formatter={(value: number) => formatAsMillions(value)}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ''}
              contentStyle={getChartTooltipContentStyle(chartTheme, { fontSize: fontSizes.tooltipMin, isMobile })}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} stroke="hsl(var(--card))" strokeWidth={1} minPointSize={8}>
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={barColors[index % barColors.length]} />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                formatter={(v: number) => formatAsMillions(v)}
                style={{ fontSize: fontSizes.axisTick, fill: chartTheme.labelFill }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
