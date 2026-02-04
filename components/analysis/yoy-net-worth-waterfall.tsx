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
import { cn } from '@/utils/cn'
import { TrendingUp, AlertCircle } from 'lucide-react'
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

export function YoYNetWorthWaterfall() {
  const { currency } = useCurrency()
  const isMobile = useIsMobile()
  const fontSizes = getChartFontSizes(isMobile)
  const [data, setData] = useState<YoYNetWorth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const { data: netWorthData, error } = await supabase
        .from('yoy_net_worth')
        .select('*')
        .order('category')

      if (error) {
        console.error('Error fetching YoY Net Worth:', error)
        setError('Failed to load year-over-year net worth data. Please try refreshing the page.')
        setLoading(false)
        return
      }
      
      setError(null)

      setData((netWorthData as YoYNetWorth[]) || [])
      setLoading(false)
    }

    fetchData()
  }, [currency])

  // Extract Year Start and Year End values for summary
  const summaryValues = useMemo(() => {
    const yearStart = data.find((item) => item.category === 'Year Start')
    const yearEnd = data.find((item) => item.category === 'Year End')
    
    return {
      yearStart: yearStart ? (currency === 'USD' ? yearStart.amount_usd : yearStart.amount_gbp) : null,
      yearEnd: yearEnd ? (currency === 'USD' ? yearEnd.amount_usd : yearEnd.amount_gbp) : null,
    }
  }, [data, currency])

  // Transform data into waterfall format showing cumulative progression
  const waterfallData = useMemo(() => {
    if (data.length === 0) return []

    const orderedCategories = [
      'Year Start',
      'Income',
      'Other Income',
      'Gift Money',
      'Expenses',
      'Investment Return YTD',
      'Transfer to Kiran',
      'Transfer to HMRC',
      'Year End',
    ]

    // Filter and order data
    const orderedData = orderedCategories
      .map((cat) => data.find((item) => item.category === cat))
      .filter(Boolean) as YoYNetWorth[]

    if (orderedData.length === 0) return []

    // Year start for y-axis normalization and running total
    const yearStart = summaryValues.yearStart ?? 0

    // Collect change items (excluding Year Start and Year End), then sort by actual value descending; Net Change stays last.
    const changes: { name: string; value: number; type: string }[] = []

    orderedData.forEach((item) => {
      const amount = currency === 'USD' ? item.amount_usd : item.amount_gbp
      const isStart = item.category === 'Year Start'
      const isEnd = item.category === 'Year End'

      if (isStart || isEnd) return

      const change = amount || 0
      if (change === 0) return

      changes.push({
        name: item.category,
        value: change,
        type: change >= 0 ? 'positive' : 'negative',
      })
    })

    // Sort by actual value descending (largest positive first, then smaller positives, then negatives, smallest/most negative last)
    changes.sort((a, b) => b.value - a.value)

    // Build waterfall with running total in this order; values relative to year start for y-axis.
    const waterfall: any[] = []
    let runningTotal = yearStart

    changes.forEach((item) => {
      const start = runningTotal
      const end = start + item.value
      runningTotal = end
      const minAbs = Math.min(start, end)
      const delta = Math.abs(item.value)
      const min = minAbs - yearStart
      waterfall.push({
        name: item.name,
        value: item.value,
        start,
        end,
        min,
        delta,
        type: item.type,
      })
    })

    // Net Change bar always last
    if (summaryValues.yearStart !== null && summaryValues.yearEnd !== null) {
      const netChange = summaryValues.yearEnd - summaryValues.yearStart
      const start = summaryValues.yearStart
      const end = summaryValues.yearEnd
      const minAbs = Math.min(start, end)
      const delta = Math.abs(netChange)
      const min = minAbs - yearStart
      waterfall.push({
        name: 'Net Change',
        value: netChange,
        start,
        end,
        min,
        delta,
        type: netChange >= 0 ? 'net-positive' : 'net-negative',
      })
    }

    return waterfall
  }, [data, currency, summaryValues])

  // Intelligent large-number format: £0.0M when |value| >= 1M, else £0.0k (for YoY change chart)
  const formatCurrencyLarge = (value: number | null) => {
    if (value === null || value === undefined) return '-'
    const abs = Math.abs(value)
    const currencySymbol = currency === 'USD' ? '$' : '£'
    if (abs >= 1_000_000) {
      return `${currencySymbol}${(abs / 1_000_000).toFixed(1)}M`
    }
    return `${currencySymbol}${(abs / 1_000).toFixed(1)}k`
  }

  const formatSignedLarge = (value: number) => {
    const sign = value >= 0 ? '+' : '-'
    return `${sign}${formatCurrencyLarge(Math.abs(value))}`
  }

  // Format currency for call-out box (full format, not compact)
  const formatCurrencyFull = (value: number) => {
    const currencySymbol = currency === 'USD' ? '$' : '£'
    const abs = Math.abs(value)
    if (abs >= 1_000_000) {
      return `${currencySymbol}${(abs / 1_000_000).toFixed(1)}M`
    }
    if (abs >= 1_000) {
      return `${currencySymbol}${(abs / 1_000).toFixed(1)}k`
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 0,
    }).format(value)
  }

  // Custom tooltip component without label
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null
    
    // Find the payload entry that's not 'min' (which is the transparent spacer)
    const dataEntry = payload.find((entry: any) => entry.dataKey !== 'min')
    if (!dataEntry) return null
    
    const data = dataEntry.payload as any
    if (!data) return null
    
    const raw = data.value as number
    const formattedValue = formatSignedLarge(raw)
    return (
      <div
        style={{
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          padding: isMobile ? '6px 10px' : '8px 12px',
          fontSize: `${fontSizes.tooltipMin}px`,
        }}
      >
        <div style={{ color: '#374151' }}>
          {data.name}: {formattedValue}
        </div>
      </div>
    )
  }

  // Waterfall bar colors: green/red for increases/decreases, darker for net change
  const getBarColor = (type: string) => {
    switch (type) {
      case 'positive':
        return '#22c55e' // Green for increase
      case 'negative':
        return '#ef4444' // Red for decrease
      case 'net-positive':
        return '#16a34a' // Darker green for net positive
      case 'net-negative':
        return '#dc2626' // Darker red for net negative
      default:
        return '#6b7280'
    }
  }

  const yDomain = useMemo(() => {
    if (waterfallData.length === 0) return [0, 0]
    let lo = Infinity
    let hi = -Infinity
    waterfallData.forEach((d) => {
      lo = Math.min(lo, d.min)
      hi = Math.max(hi, d.min + d.delta)
    })
    const range = hi - lo
    const padding = range > 0 ? range * 0.08 : Math.abs(lo) * 0.08 || 1
    return [lo - padding, hi + padding]
  }, [waterfallData])

  if (loading) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <Skeleton className="h-6 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2 pt-2 pb-6 border-b">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-4 w-48" />
              ))}
            </div>
            <Skeleton className="h-96 w-full" />
          </div>
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

  if (waterfallData.length === 0) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Year-over-Year Net Worth Change</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={TrendingUp}
            title="No net worth data available"
            description="Year-over-year net worth change data has not been synced yet. Please refresh the data to load this information."
          />
        </CardContent>
      </Card>
    )
  }

  // Calculate net change and percentage change for call-out box
  const netChange = summaryValues.yearStart !== null && summaryValues.yearEnd !== null
    ? summaryValues.yearEnd - summaryValues.yearStart
    : null

  const percentChange = netChange !== null && summaryValues.yearStart !== null && summaryValues.yearStart !== 0
    ? (netChange / summaryValues.yearStart) * 100
    : null

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? '+' : ''
    return `${sign}${value.toFixed(1)}%`
  }

  return (
    <Card>
      <CardHeader className="bg-muted/50">
        <div className="flex flex-col gap-3">
          <div>
            <CardTitle className="text-xl">Year-over-Year Net Worth Change</CardTitle>
          </div>
          {netChange !== null && (
            <div className="rounded-lg border border-border bg-background p-3 shadow-sm">
              <span className="text-sm font-medium tabular-nums">
                {netChange > 0 && (
                  <>
                    Net worth increased by{' '}
                    <span className={cn('font-bold', 'text-green-600 dark:text-green-500')}>
                      {formatCurrencyFull(Math.abs(netChange))}
                    </span>
                    {percentChange !== null && (
                      <>
                        {' '}(
                        <span className={cn('font-bold', 'text-green-600 dark:text-green-500')}>
                          {formatPercent(percentChange)}
                        </span>
                        )
                      </>
                    )}
                  </>
                )}
                {netChange < 0 && (
                  <>
                    Net worth decreased by{' '}
                    <span className={cn('font-bold', 'text-red-600 dark:text-red-500')}>
                      {formatCurrencyFull(Math.abs(netChange))}
                    </span>
                    {percentChange !== null && (
                      <>
                        {' '}(
                        <span className={cn('font-bold', 'text-red-600 dark:text-red-500')}>
                          {formatPercent(percentChange)}
                        </span>
                        )
                      </>
                    )}
                  </>
                )}
                {netChange === 0 && (
                  <>
                    Net worth unchanged
                    {percentChange !== null && (
                      <>
                        {' '}(
                        <span className={cn('font-bold', 'text-muted-foreground')}>
                          {formatPercent(percentChange)}
                        </span>
                        )
                      </>
                    )}
                  </>
                )}
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={isMobile ? 260 : 360}>
          <BarChart
            data={waterfallData}
            margin={isMobile ? { top: 10, right: 10, left: 0, bottom: 5 } : { top: 44, right: 30, left: 20, bottom: 72 }}
            barCategoryGap="20%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={isMobile ? 80 : 100}
              stroke="#6b7280"
              tickCount={isMobile ? 5 : undefined}
              interval={isMobile ? 'preserveStartEnd' : undefined}
              tick={(props: any) => {
                const { x, y, payload } = props
                const isNetChange = payload.value === 'Net Change'
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text
                      x={0}
                      y={0}
                      dy={16}
                      textAnchor="end"
                      fill={isNetChange ? '#000' : '#6b7280'}
                      fontSize={fontSizes.axisTick}
                      fontWeight={isNetChange ? 'bold' : 'normal'}
                      transform="rotate(-45)"
                    >
                      {payload.value}
                    </text>
                  </g>
                )
              }}
            />
            <YAxis
              domain={yDomain}
              tickFormatter={(v) => (v < 0 ? '-' : '') + formatCurrencyLarge(Math.abs(v))}
              tick={{ fontSize: fontSizes.axisTick }}
              stroke="#6b7280"
              width={isMobile ? 48 : 60}
            />
            <Tooltip content={<CustomTooltip />} />
            {/* Series A: transparent spacer (pedestal) so visible bar starts at running total */}
            <Bar dataKey="min" stackId="waterfall" fill="transparent" stroke="none" />
            {/* Series B: visible delta bar, colored by increase/decrease */}
            <Bar dataKey="delta" stackId="waterfall" radius={[4, 4, 0, 0]} stroke="#fff" strokeWidth={1} minPointSize={2}>
              {waterfallData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.type)} />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                offset={12}
                content={(props: any) => {
                  const x = Number(props.x) ?? 0
                  const y = Number(props.y) ?? 0
                  const width = Number(props.width) ?? 0
                  const height = Number(props.height) ?? 0
                  const payload = props.payload
                  const value = payload?.value
                  if (value == null || value === undefined) return null
                  const text = formatSignedLarge(value)
                  const isNetChange = payload?.name === 'Net Change'
                  const isNegative = value < 0
                  const labelY = isNegative ? y + height + 14 : y - 14
                  return (
                    <g transform={`translate(${x + width / 2},${labelY})`}>
                      <text
                        textAnchor="middle"
                        dy={0}
                        fill="#374151"
                        fontSize={fontSizes.axisTick}
                        style={{ fontWeight: isNetChange ? 700 : 400 }}
                      >
                        {text}
                      </text>
                    </g>
                  )
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
