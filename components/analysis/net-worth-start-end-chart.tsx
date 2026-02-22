'use client'

import { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { useChartTheme } from '@/lib/hooks/use-chart-theme'
import { getChartFontSizes } from '@/lib/chart-styles'
import { createClient } from '@/lib/supabase/client'
import { YoYNetWorth } from '@/lib/types'
import type { YearStartYearEndSnapshot } from '@/lib/net-worth-from-accounts'
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

export type NetWorthStartEndInitialData = YearStartYearEndSnapshot

interface NetWorthStartEndChartProps {
  /** When provided, chart uses this instead of fetching yoy_net_worth (e.g. from account_balances). */
  initialData?: YearStartYearEndSnapshot | null
}

export function NetWorthStartEndChart({ initialData }: NetWorthStartEndChartProps = {}) {
  const { currency } = useCurrency()
  const isMobile = useIsMobile()
  const chartTheme = useChartTheme()
  const [data, setData] = useState<YoYNetWorth[]>([])
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialData != null) {
      setLoading(false)
      setError(null)
      return
    }

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
  }, [currency, initialData])

  const chartData = useMemo(() => {
    if (initialData) {
      const getAmount = (x: { amount_usd: number; amount_gbp: number }) =>
        currency === 'USD' ? x.amount_usd : x.amount_gbp
      return [
        { name: 'Year Start', value: getAmount(initialData.yearStart), label: 'Prior year-end net worth' },
        { name: 'Current', value: getAmount(initialData.yearEnd), label: 'Current net worth' },
      ]
    }

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
        name: 'Current',
        value: getAmount(yearEndItem),
        label: 'Current net worth',
      })
    }

    return rows
  }, [data, currency, initialData])

  const symbol = currency === 'USD' ? '$' : '£'
  const formatAsMillions = (value: number) => {
    const abs = Math.abs(value)
    const m = abs / 1_000_000
    const s = value < 0 ? '-' : ''
    return `${s}${symbol}${m.toFixed(1)}M`
  }

  if (loading) {
    return (
      <Card className="border-l-[3px] border-l-blue-500">
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
      <Card className="border-l-[3px] border-l-blue-500">
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
      <Card className="border-l-[3px] border-l-blue-500">
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
    <Card className="border-l-[3px] border-l-blue-500">
      <CardHeader className="bg-muted/50">
        <CardTitle className="text-xl">Net Worth: Year Start vs Year End</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Prior year-end net worth compared with current net worth
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
              formatter={(value: number) => formatAsMillions(value)}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ''}
              contentStyle={{
                backgroundColor: chartTheme.tooltipBg,
                borderColor: chartTheme.tooltipBorder,
                color: chartTheme.tooltipText,
                borderRadius: '6px',
                padding: isMobile ? '6px 10px' : '8px 12px',
                fontSize: `${fontSizes.tooltipMin}px`,
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
                style={{ fontSize: fontSizes.axisTick, fill: chartTheme.labelFill }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
