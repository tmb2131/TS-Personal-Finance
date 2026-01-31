'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
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
    bars.push({
      name: 'Start',
      min: 0,
      delta: data.totalStart,
      value: data.totalStart,
      type: 'start',
    })

    let running = data.totalStart
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

    const endImproved = data.totalEnd < data.totalStart
    const endWorsened = data.totalEnd > data.totalStart
    bars.push({
      name: 'End',
      min: 0,
      delta: data.totalEnd,
      value: data.totalEnd,
      type: endImproved ? 'end_improved' : endWorsened ? 'end_worsened' : 'end',
    })

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
    if (waterfallData.length === 0) return [0, 0]
    let hi = 0
    waterfallData.forEach((d) => {
      hi = Math.max(hi, d.min + d.delta)
    })
    const padding = hi * 0.08 || 1
    return [0, hi + padding]
  }, [waterfallData])

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

  return (
    <Card>
      <CardHeader className="bg-muted/50">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <CardTitle className="text-xl">Forecast Evolution</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Gap change {data.startDate} → {data.endDate}.
              <br />
              Green = improved, red = worsened.
            </p>
          </div>
          <div className="overflow-x-auto rounded-md border border-border bg-background px-3 py-2 shrink-0 self-start sm:mt-0">
            <table className="w-auto text-sm border-collapse">
              <thead>
                <tr className="text-muted-foreground text-xs">
                  <th className="text-left font-medium text-foreground py-0.5 pr-3"></th>
                  <th className="text-left py-0.5 pr-3">Budget</th>
                  <th className="text-left py-0.5 pr-3">Tracking</th>
                  <th className="text-left py-0.5">Gap</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr>
                  <td className="font-medium text-foreground py-0.5 pr-3">{data.startDate}</td>
                  <td className="text-left tabular-nums py-0.5 pr-3">
                    {formatCurrencyFull(data.expensesBudgetStart)}
                  </td>
                  <td className="text-left tabular-nums py-0.5 pr-3">
                    {formatCurrencyFull(data.expensesForecastStart)}
                  </td>
                  <td className="text-left tabular-nums py-0.5">{formatCurrencyFull(data.totalStart)}</td>
                </tr>
                <tr>
                  <td className="font-medium text-foreground py-0.5 pr-3">{data.endDate}</td>
                  <td className="text-left tabular-nums py-0.5 pr-3">
                    {formatCurrencyFull(data.expensesBudgetEnd)}
                  </td>
                  <td className="text-left tabular-nums py-0.5 pr-3">
                    {formatCurrencyFull(data.expensesForecastEnd)}
                  </td>
                  <td className="text-left tabular-nums py-0.5">{formatCurrencyFull(data.totalEnd)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={360}>
          <BarChart
            data={waterfallData}
            margin={{ top: 44, right: 30, left: 20, bottom: 72 }}
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
                      fontSize={12}
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
              tickFormatter={formatCurrency}
              tick={{ fontSize: isMobile ? 10 : 12 }}
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
                padding: '8px 12px',
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
                      <text textAnchor="middle" dy={0} fill="#374151" fontSize={11}>
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
