'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  Cell,
} from 'recharts'
import type { TransactionForecastResult } from '@/lib/forecast-transaction-based'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function ForecastMonthlyChart({ data }: { data: TransactionForecastResult }) {
  const { currency, convertAmount } = useCurrency()
  const isMobile = useIsMobile()
  const chartTheme = useChartTheme()
  const fontSizes = getChartFontSizes(isMobile)

  const t = data.ensemble.totals
  const m1 = data.methodologies.find((m) => m.id === 'm1')!
  const m2 = data.methodologies.find((m) => m.id === 'm2')!
  const m3 = data.methodologies.find((m) => m.id === 'm3')!

  const m1ByMonth = sumAllCategories(m1)
  const m2ByMonth = sumAllCategories(m2)
  const m3ByMonth = sumAllCategories(m3)

  const chartData = MONTH_LABELS.map((label, i) => {
    const type = t.monthType[i]
    const isPast = type === 'actual'
    // 'partial' and 'forecast' both have methodology spread; both render as forecast bars.
    const showForecast = type !== 'actual'
    return {
      month: label,
      actual: isPast ? convertAmount(t.monthsBase[i], 'GBP') : null,
      forecast: showForecast ? convertAmount(t.monthsBase[i], 'GBP') : null,
      low: showForecast ? convertAmount(t.monthsLow[i], 'GBP') : null,
      high: showForecast ? convertAmount(t.monthsHigh[i], 'GBP') : null,
      m1: showForecast ? convertAmount(m1ByMonth[i], 'GBP') : null,
      m2: showForecast ? convertAmount(m2ByMonth[i], 'GBP') : null,
      m3: showForecast ? convertAmount(m3ByMonth[i], 'GBP') : null,
      monthType: type,
    }
  })

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

  const progressPct = Math.round((data.ensemble.currentMonthProgress ?? 0) * 100)

  const tooltipContent = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const row = payload[0]?.payload
    if (!row) return null
    const titleSuffix =
      row.monthType === 'partial'
        ? ` (MTD + projection, ${progressPct}% elapsed)`
        : row.monthType === 'forecast'
          ? ' (forecast)'
          : ''
    return (
      <div
        style={getChartTooltipContentStyle(chartTheme, { isMobile })}
        className="text-xs"
      >
        <div className="font-semibold mb-1">
          {label} {data.year}
          <span className="font-normal text-muted-foreground">{titleSuffix}</span>
        </div>
        {row.monthType === 'actual' ? (
          <div>
            <span className="text-muted-foreground">Actual:</span>{' '}
            <span className="font-medium">{fmtFull(row.actual ?? 0)}</span>
          </div>
        ) : (
          <>
            <div>
              <span className="text-muted-foreground">Base:</span>{' '}
              <span className="font-medium">{fmtFull(row.forecast ?? 0)}</span>
            </div>
            <div className="text-muted-foreground">
              Range: {fmtFull(row.low ?? 0)} – {fmtFull(row.high ?? 0)}
            </div>
            <div className="mt-1 pt-1 border-t border-border">
              <div>M1 Seasonal: {fmtFull(row.m1 ?? 0)}</div>
              <div>M2 Seasonal+Trend: {fmtFull(row.m2 ?? 0)}</div>
              <div>M3 Fixed+Variable: {fmtFull(row.m3 ?? 0)}</div>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg md:text-xl">Month-by-month forecast</CardTitle>
        <p className="text-xs text-muted-foreground">
          Solid bars are completed-month actuals. The current month is MTD plus a remaining-days projection
          ({progressPct}% elapsed). Lighter bars are ensemble base forecast for future months; shaded band
          shows the low/high range across the three methodologies.
        </p>
      </CardHeader>
      <CardContent className="px-2 md:px-6">
        <div className="h-[320px] md:h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 10, bottom: 0, left: 0 }}
            >
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
                cursor={{ fill: chartTheme.gridStroke, opacity: 0.3 }}
              />
              <Legend
                wrapperStyle={{ fontSize: fontSizes.legend }}
                iconSize={fontSizes.iconSize}
              />
              {/* Forecast band — translucent area between low/high overlaid on forecast months */}
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
              <Bar dataKey="actual" name="Actual" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="forecast" name="Forecast (base)" fill="#6366f1" radius={[3, 3, 0, 0]} fillOpacity={0.85} />
              <ReferenceLine
                x={MONTH_LABELS[Math.max(0, data.currentMonth - 1)]}
                stroke={chartTheme.axisStroke}
                strokeDasharray="3 3"
                label={{
                  value: 'now',
                  position: 'top',
                  fill: chartTheme.labelFill,
                  fontSize: fontSizes.axisTick,
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

function sumAllCategories(m: TransactionForecastResult['methodologies'][number]): number[] {
  const out = new Array(12).fill(0)
  for (const c of m.byCategory) {
    for (let i = 0; i < 12; i++) out[i] += c.months[i]
  }
  return out
}
