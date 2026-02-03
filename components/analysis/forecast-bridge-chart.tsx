'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { getChartFontSizes } from '@/lib/chart-styles'
import { cn } from '@/utils/cn'
import { AlertCircle, TrendingUp } from 'lucide-react'
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

const DRIVER_MIN_SHARE = 0.05

export type ForecastBridgeDriver = {
  category: string
  startForecast: number
  endForecast: number
  delta: number
}

export type ForecastBridgeData = {
  startDate: string
  endDate: string
  expensesBudgetStart: number
  expensesForecastStart: number
  expensesBudgetEnd: number
  expensesForecastEnd: number
  totalStart: number
  totalEnd: number
  drivers: ForecastBridgeDriver[]
}

type WaterfallBar = {
  name: string
  min: number
  delta: number
  value: number
  type: 'start' | 'end' | 'end_improved' | 'end_worsened' | 'positive' | 'negative'
}

type ForecastBridgeChartProps = {
  startDate: string
  endDate: string
}

export function ForecastBridgeChart({ startDate, endDate }: ForecastBridgeChartProps) {
  const { currency } = useCurrency()
  const isMobile = useIsMobile()
  const [data, setData] = useState<ForecastBridgeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ startDate, endDate })
      const res = await fetch(`/api/forecast-bridge?${params}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const json: ForecastBridgeData = await res.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load forecast bridge data')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const waterfallData = useMemo((): WaterfallBar[] => {
    if (!data) return []

    const bars: WaterfallBar[] = []
    let running = 0
    for (const d of data.drivers) {
      const start = running
      const end = running + d.delta
      running = end
      const minVal = Math.min(start, end)
      bars.push({
        name: d.category,
        min: minVal,
        delta: Math.abs(d.delta),
        value: d.delta,
        type: d.delta < 0 ? 'negative' : 'positive',
      })
    }
    return bars
  }, [data])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value)
  }

  const formatCurrencyFull = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 0,
    }).format(value)
  }

  // Gap: negative = under budget (good), positive = over budget (bad). Bar = change in gap: negative delta = green, positive = red. End bar = darker shade by improvement/worsening.
  const getBarColor = (type: string) => {
    switch (type) {
      case 'start':
      case 'end':
        return '#6b7280'
      case 'end_improved':
        return '#15803d'
      case 'end_worsened':
        return '#b91c1c'
      case 'negative':
        return '#22c55e'
      case 'positive':
        return '#ef4444'
      default:
        return '#6b7280'
    }
  }

  const yDomain = useMemo(() => {
    if (waterfallData.length === 0 || !data) return [0, 0]
    const netChange = data.totalEnd - data.totalStart
    const allY = waterfallData.flatMap((d) => [d.min, d.min + d.delta])
    const dataLo = Math.min(0, ...allY)
    const dataHi = Math.max(0, ...allY)
    const range = Math.abs(dataHi - dataLo) || 1
    const padding = range * 0.08
    const step =
      range <= 100 ? 20 : range <= 500 ? 100 : range <= 2500 ? 500 : range <= 10000 ? 1000 : 2000
    const niceLo = dataLo <= 0 ? Math.floor((dataLo - padding) / step) * step : 0
    const niceHi = dataHi >= 0 ? Math.ceil((dataHi + padding) / step) * step : 0
    if (netChange >= 0) {
      return [0, Math.max(niceHi, dataHi + padding)]
    }
    return [Math.min(niceLo, dataLo - padding), 0]
  }, [waterfallData, data])

  if (loading) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <Skeleton className="h-6 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Forecast Evolution</CardTitle>
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

  if (!data || waterfallData.length === 0) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Forecast Evolution</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={TrendingUp}
            title="No forecast history yet"
            description="Budget history is recorded daily. Run a sync or wait for the next daily snapshot to see how your annual forecast changes over time."
          />
        </CardContent>
      </Card>
    )
  }

  const fontSizes = getChartFontSizes(isMobile)

  const netChange = data.totalEnd - data.totalStart
  const absAmount = formatCurrencyFull(Math.abs(netChange))
  const shortDate = (s: string) => {
    const d = new Date(s + 'T12:00:00')
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }
  const periodLabel = `${shortDate(data.startDate)} → ${shortDate(data.endDate)}`

  const totalAbsoluteDelta = data.drivers.reduce((sum, d) => sum + Math.abs(d.delta), 0)
  const worsened = data.drivers
    .filter(
      (d) =>
        d.delta > 0 &&
        (totalAbsoluteDelta === 0 || Math.abs(d.delta) >= DRIVER_MIN_SHARE * totalAbsoluteDelta)
    )
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  const improved = data.drivers
    .filter(
      (d) =>
        d.delta < 0 &&
        (totalAbsoluteDelta === 0 || Math.abs(d.delta) >= DRIVER_MIN_SHARE * totalAbsoluteDelta)
    )
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  const hasWorsened = worsened.length > 0
  const hasImproved = improved.length > 0
  // When gap worsened, lead with worsening drivers; when improved, lead with improvement drivers
  const driversFirst = netChange > 0 ? worsened : improved
  const driversSecond = netChange > 0 ? improved : worsened
  const hasFirst = netChange > 0 ? hasWorsened : hasImproved
  const hasSecond = netChange > 0 ? hasImproved : hasWorsened
  const driverSubtext =
    hasWorsened || hasImproved
      ? [
          hasFirst && `Driven by ${driversFirst.map((d) => d.category).join(', ')}`,
          hasSecond && `partially offset by ${driversSecond.map((d) => d.category).join(', ')}`,
        ]
          .filter(Boolean)
          .join(', ')
      : null

  return (
    <Card>
      <CardHeader className="bg-muted/50">
        <div className="flex flex-col gap-3">
          <div>
            <CardTitle className="text-xl">Forecast Evolution</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">{periodLabel}</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-3 shadow-sm space-y-1">
            <span
              className={cn(
                'text-sm font-medium tabular-nums',
                netChange < 0 && 'text-green-600 dark:text-green-500',
                netChange > 0 && 'text-red-600 dark:text-red-500',
                netChange === 0 && 'text-muted-foreground'
              )}
            >
              {netChange < 0 && `Gap to budget improved by ${absAmount}`}
              {netChange > 0 && `Gap to budget worsened by ${absAmount}`}
              {netChange === 0 && 'Gap to budget unchanged'}
            </span>
            {driverSubtext && (
              <p className="text-xs text-muted-foreground">
                {hasFirst && (
                  <>
                    Driven by{' '}
                    {driversFirst.map((d, i) => (
                      <span key={d.category}>
                        {i > 0 && ', '}
                        <span
                          className={cn(
                            'font-semibold',
                            netChange > 0 ? 'text-red-600 dark:text-red-500' : 'text-green-600 dark:text-green-500'
                          )}
                        >
                          {d.category}
                        </span>
                      </span>
                    ))}
                  </>
                )}
                {hasFirst && hasSecond && ', '}
                {hasSecond && (
                  <>
                    partially offset by{' '}
                    {driversSecond.map((d, i) => (
                      <span key={d.category}>
                        {i > 0 && ', '}
                        <span
                          className={cn(
                            'font-semibold',
                            netChange > 0 ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'
                          )}
                        >
                          {d.category}
                        </span>
                      </span>
                    ))}
                  </>
                )}
              </p>
            )}
          </div>
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
              tick={(props: { x: number; y: number; payload: { value: string } }) => {
                const { x, y, payload } = props
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text
                      x={0}
                      y={0}
                      dy={16}
                      textAnchor="end"
                      fill="#6b7280"
                      fontSize={fontSizes.axisTick}
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
              reversed={!!(data && data.totalEnd - data.totalStart < 0)}
              tickFormatter={formatCurrency}
              tick={{ fontSize: fontSizes.axisTick }}
              stroke="#6b7280"
              width={isMobile ? 48 : 60}
            />
            <Tooltip
              formatter={(value: number, name: string, props: { payload?: WaterfallBar }) => {
                const payload = props?.payload
                if (!payload || name === 'min') return null
                const raw = payload.value as number
                if (payload.type === 'start' || payload.type === 'end') {
                  return [formatCurrencyFull(raw), payload.name]
                }
                const sign = raw >= 0 ? '+' : ''
                return [`${sign}${formatCurrencyFull(raw)}`, payload.name]
              }}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: isMobile ? '6px 10px' : '8px 12px',
                fontSize: `${fontSizes.tooltipMin}px`,
              }}
            />
            <Bar dataKey="min" stackId="bridge" fill="transparent" stroke="none" />
            <Bar
              dataKey="delta"
              stackId="bridge"
              radius={[4, 4, 0, 0]}
              stroke="#fff"
              strokeWidth={1}
              minPointSize={2}
            >
              {waterfallData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.type)} />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                offset={12}
                content={(props: {
                  x?: string | number
                  y?: string | number
                  width?: string | number
                  height?: string | number
                  payload?: WaterfallBar
                }) => {
                  const x = Number(props.x ?? 0)
                  const y = Number(props.y ?? 0)
                  const width = Number(props.width ?? 0)
                  const height = Number(props.height ?? 0)
                  const payload = props.payload
                  const value = payload?.value
                  if (value == null) return null
                  const isStartEnd = payload?.type === 'start' || payload?.type === 'end' || payload?.type === 'end_improved' || payload?.type === 'end_worsened'
                  const text = isStartEnd
                    ? formatCurrencyFull(value)
                    : `${value >= 0 ? '+' : ''}${formatCurrencyFull(value)}`
                  const isNegative = value < 0 && !isStartEnd
                  const labelY = isNegative ? y + height + 14 : y - 14
                  return (
                    <g transform={`translate(${x + width / 2},${labelY})`}>
                      <text textAnchor="middle" dy={0} fill="#374151" fontSize={fontSizes.axisTick}>
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
