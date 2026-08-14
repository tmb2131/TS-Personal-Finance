'use client'

import { useForecastGapOverTime } from '@/lib/hooks/queries/use-forecast-gap-over-time'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { useChartTheme } from '@/lib/hooks/use-chart-theme'
import { getChartFontSizes, getChartTooltipContentStyle, getChartTooltipWrapperStyle } from '@/lib/chart-styles'
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
  const chartTheme = useChartTheme()
  const { data: apiData, isLoading: loading, error: queryError } = useForecastGapOverTime(
    startDate,
    endDate,
  )
  const data: ForecastGapOverTimePoint[] = apiData?.data ?? []
  const error: string | null =
    queryError == null
      ? null
      : queryError instanceof Error
        ? queryError.message
        : String(queryError)

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
        <CardHeader>
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
        <CardHeader>
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
        <CardHeader>
          <CardTitle className="text-xl">Gap to budget over time</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={AlertCircle}
            title="No data for this period"
            description="No forecast gap data is available for this period yet. Add budget categories or transactions to start tracking the trend."
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
      <CardHeader>
        <CardTitle className="text-xl">Gap to budget over time</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          📉 Downward slope: Under Budget (Narrowing) | 📈 Upward slope: Above Budget (Widening)
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={isMobile ? 260 : 320}>
          <LineChart data={chartData} margin={isMobile ? { top: 10, right: 10, left: 0, bottom: 5 } : { top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDateLabel}
              tick={{ fontSize: fontSizes.axisTick, fill: chartTheme.labelFill }}
              stroke={chartTheme.axisStroke}
              angle={isMobile ? -45 : 0}
              textAnchor={isMobile ? 'end' : 'middle'}
              height={isMobile ? 60 : 36}
              interval={isMobile ? 'preserveStartEnd' : undefined}
              tickCount={isMobile ? 5 : undefined}
            />
            <YAxis
              tickFormatter={(v) => formatCurrency(v)}
              tick={{ fontSize: fontSizes.axisTick, fill: chartTheme.labelFill }}
              stroke={chartTheme.axisStroke}
              width={isMobile ? 48 : 60}
              domain={['auto', 'auto']}
            />
            <ReferenceLine y={0} stroke={chartTheme.axisStroke} strokeDasharray="3 3" />
            <Tooltip
              wrapperStyle={getChartTooltipWrapperStyle(chartTheme)}
              formatter={(value: number) => [formatCurrencyFull(value), 'Gap']}
              labelFormatter={(label) => chartData.find((d) => d.date === label)?.label ?? label}
              contentStyle={getChartTooltipContentStyle(chartTheme, { fontSize: fontSizes.tooltipMin, isMobile })}
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
