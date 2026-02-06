'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { getChartFontSizes } from '@/lib/chart-styles'
import { AlertCircle } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

export type ForecastGapOverTimePoint = {
  date: string
  gap: number
}

type ForecastGapOverTimeChartProps = {
  startDate: string
  endDate: string
}

export function ForecastGapOverTimeChart({ startDate, endDate }: ForecastGapOverTimeChartProps) {
  const { currency } = useCurrency()
  const isMobile = useIsMobile()
  const [data, setData] = useState<ForecastGapOverTimePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ startDate, endDate })
      const res = await fetch(`/api/forecast-gap-over-time?${params}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const json: { data: ForecastGapOverTimePoint[] } = await res.json()
      setData(json.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load gap over time data')
      setData([])
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

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

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  const fontSizes = getChartFontSizes(isMobile)

  if (loading) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[360px] w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Gap to budget over time</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={AlertCircle}
            title="Unable to load chart"
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
          <CardTitle className="text-xl">Gap to budget over time</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={AlertCircle}
            title="No data for this period"
            description="Budget history is recorded daily. Run a sync or wait for the next daily snapshot to see gap over time."
          />
        </CardContent>
      </Card>
    )
  }

  const chartData = data.map((d) => ({
    ...d,
    label: formatDateLabel(d.date),
  }))

  return (
    <Card>
      <CardHeader className="bg-muted/50">
        <CardTitle className="text-xl">Gap to budget over time</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          📉 Downward slope: Under Budget (Improved) | 📈 Upward slope: Over Budget (Worsened)
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={isMobile ? 260 : 320}>
          <LineChart data={chartData} margin={isMobile ? { top: 10, right: 10, left: 0, bottom: 5 } : { top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDateLabel}
              tick={{ fontSize: fontSizes.axisTick }}
              stroke="#6b7280"
              angle={isMobile ? -45 : 0}
              textAnchor={isMobile ? 'end' : 'middle'}
              height={isMobile ? 60 : 36}
              interval={isMobile ? 'preserveStartEnd' : undefined}
              tickCount={isMobile ? 5 : undefined}
            />
            <YAxis
              tickFormatter={(v) => formatCurrency(v)}
              tick={{ fontSize: fontSizes.axisTick }}
              stroke="#6b7280"
              width={isMobile ? 48 : 60}
              domain={['auto', 'auto']}
            />
            <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" />
            <Tooltip
              formatter={(value: number) => [formatCurrencyFull(value), 'Gap']}
              labelFormatter={(label) => chartData.find((d) => d.date === label)?.label ?? label}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: isMobile ? '6px 10px' : '8px 12px',
                fontSize: `${fontSizes.tooltipMin}px`,
              }}
            />
            <Line
              type="monotone"
              dataKey="gap"
              stroke="#6366f1"
              strokeWidth={2}
              dot={{ fill: '#6366f1', r: 3 }}
              activeDot={{ r: 5 }}
              name="Gap"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
