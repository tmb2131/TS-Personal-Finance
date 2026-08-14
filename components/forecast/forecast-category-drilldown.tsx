'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { useChartTheme } from '@/lib/hooks/use-chart-theme'
import {
  getChartFontSizes,
  getChartTooltipContentStyle,
  getChartTooltipWrapperStyle,
} from '@/lib/chart-styles'
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts'
import type { TransactionForecastResult } from '@/lib/forecast-transaction-based'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function ForecastCategoryDrilldown({
  data,
  category,
  onClose,
}: {
  data: TransactionForecastResult
  category: string
  onClose: () => void
}) {
  const { currency, convertAmount } = useCurrency()
  const isMobile = useIsMobile()
  const chartTheme = useChartTheme()
  const fontSizes = getChartFontSizes(isMobile)

  const m1 = data.methodologies.find((m) => m.id === 'm1')!.byCategory.find((c) => c.category === category)
  const m2 = data.methodologies.find((m) => m.id === 'm2')!.byCategory.find((c) => c.category === category)
  const m3 = data.methodologies.find((m) => m.id === 'm3')!.byCategory.find((c) => c.category === category)
  const ens = data.ensemble.categories.find((c) => c.category === category)

  const fmtCompact = (n: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n)

  const fmtFull = (n: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(n)

  const chartData = useMemo(() => {
    if (!m1 || !m2 || !m3 || !ens) return []
    return MONTH_LABELS.map((label, i) => {
      const type = ens.monthType[i]
      const isPast = type === 'actual'
      const showForecast = type !== 'actual'
      return {
        month: label,
        actual: isPast ? convertAmount(m1.months[i], 'GBP') : null,
        m1: showForecast ? convertAmount(m1.months[i], 'GBP') : null,
        m2: showForecast ? convertAmount(m2.months[i], 'GBP') : null,
        m3: showForecast ? convertAmount(m3.months[i], 'GBP') : null,
        low: showForecast ? convertAmount(ens.monthsLow[i], 'GBP') : null,
        high: showForecast ? convertAmount(ens.monthsHigh[i], 'GBP') : null,
        monthType: type,
      }
    })
  }, [m1, m2, m3, ens, convertAmount])

  if (!ens || !m1 || !m2 || !m3) {
    return null
  }

  const tooltipContent = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const row = payload[0]?.payload
    if (!row) return null
    const progressPct = Math.round((data.ensemble.currentMonthProgress ?? 0) * 100)
    const titleSuffix =
      row.monthType === 'partial'
        ? ` (MTD + projection, ${progressPct}% elapsed)`
        : row.monthType === 'forecast'
          ? ' (forecast)'
          : ''
    return (
      <div style={getChartTooltipContentStyle(chartTheme, { isMobile })} className="text-xs">
        <div className="font-semibold mb-1">
          {label} {data.year}
          <span className="font-normal text-muted-foreground">{titleSuffix}</span>
        </div>
        {row.monthType === 'actual' ? (
          <div>Actual: <span className="font-medium">{fmtFull(row.actual ?? 0)}</span></div>
        ) : (
          <>
            <div>M1 Seasonal: {fmtFull(row.m1 ?? 0)}</div>
            <div>M2 Seasonal+Trend: {fmtFull(row.m2 ?? 0)}</div>
            <div>M3 Fixed+Variable: {fmtFull(row.m3 ?? 0)}</div>
            <div className="mt-1 pt-1 border-t border-border text-muted-foreground">
              Range: {fmtFull(row.low ?? 0)} – {fmtFull(row.high ?? 0)}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div>
          <CardTitle className="text-lg md:text-xl">{category} — methodology comparison</CardTitle>
          <p className="text-xs text-muted-foreground">
            Actuals through {MONTH_LABELS[Math.max(0, data.currentMonth - 1)]} {data.year}, then each
            methodology&apos;s remaining-month forecast.
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="px-2 md:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-sm">
          <Stat label="YTD" value={fmtFull(convertAmount(ens.ytd, 'GBP'))} />
          <Stat label="M1 Seasonal" value={fmtFull(convertAmount(ens.byMethodology.m1, 'GBP'))} />
          <Stat label="M2 Seasonal+Trend" value={fmtFull(convertAmount(ens.byMethodology.m2, 'GBP'))} />
          <Stat label="M3 Fixed+Variable" value={fmtFull(convertAmount(ens.byMethodology.m3, 'GBP'))} />
        </div>

        <div className="h-[280px] md:h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={chartTheme.gridStroke} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" stroke={chartTheme.axisStroke} tick={{ fontSize: fontSizes.axisTick }} />
              <YAxis
                stroke={chartTheme.axisStroke}
                tick={{ fontSize: fontSizes.axisTick }}
                tickFormatter={fmtCompact}
                width={isMobile ? 50 : 70}
              />
              <Tooltip
                content={tooltipContent}
                wrapperStyle={getChartTooltipWrapperStyle(chartTheme)}
                cursor={{ stroke: chartTheme.gridStroke, opacity: 0.5 }}
              />
              <Legend wrapperStyle={{ fontSize: fontSizes.legend }} iconSize={fontSizes.iconSize} />
              <Area
                type="monotone"
                dataKey="high"
                stroke="none"
                fill="#6366f1"
                fillOpacity={0.12}
                connectNulls={false}
                isAnimationActive={false}
                legendType="none"
              />
              <Area
                type="monotone"
                dataKey="low"
                stroke="none"
                fill={chartTheme.isDark ? '#0b0f1a' : '#ffffff'}
                fillOpacity={1}
                connectNulls={false}
                isAnimationActive={false}
                legendType="none"
              />
              <Line
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls={false}
              />
              <Line type="monotone" dataKey="m1" name="M1 Seasonal" stroke="#6366f1" strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="m2" name="M2 Seasonal+Trend" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="m3" name="M3 Fixed+Variable" stroke="#ec4899" strokeWidth={2} dot={false} connectNulls={false} />
              <ReferenceLine
                x={MONTH_LABELS[Math.max(0, data.currentMonth - 1)]}
                stroke={chartTheme.axisStroke}
                strokeDasharray="3 3"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm md:text-base font-semibold num">{value}</div>
    </div>
  )
}
