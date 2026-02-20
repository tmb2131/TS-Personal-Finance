'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { useChartTheme } from '@/lib/hooks/use-chart-theme'
import { getChartFontSizes } from '@/lib/chart-styles'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

const METHODOLOGY_ORDER = ['Annual', 'Budget', 'Linear', 'Manual'] as const
const SPEND_FILL = '#f59e0b'
const SPEND_FILL_ALT = '#d97706'
/** Lighter segment for headroom; top of bar shows spend + headroom (dashed effect via label) */
const HEADROOM_FILL = '#fcd34d'
const HEADROOM_FILL_ALT = '#fde68a'

type TodaySpendByMethodologyChartProps = {
  spendByMethodology: Record<string, number>
  headroomByMethodology: Record<string, number | null>
  /** Implied change in overall forecast if no more spend today (tomorrow − today). Positive = rises. */
  impliedForecastChange?: number | null
}

export function TodaySpendByMethodologyChart({
  spendByMethodology,
  headroomByMethodology,
  impliedForecastChange,
}: TodaySpendByMethodologyChartProps) {
  const { currency } = useCurrency()
  const isMobile = useIsMobile()
  const chartTheme = useChartTheme()

  const chartData = useMemo(() => {
    return METHODOLOGY_ORDER.map((method) => {
      const spend = Number(spendByMethodology[method]) || 0
      const headroom = headroomByMethodology[method]
      const headroomVal =
        headroom != null && Number.isFinite(headroom) ? headroom : 0
      return {
        name: method,
        spend,
        headroom: headroomVal,
      }
    })
  }, [spendByMethodology, headroomByMethodology])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const fontSizes = getChartFontSizes(isMobile)
  const chartHeight = isMobile ? 260 : 320

  const impliedChangeText =
    impliedForecastChange != null && Number.isFinite(impliedForecastChange)
      ? impliedForecastChange > 0
        ? `If no more spend today: overall forecast rises by ${formatCurrency(impliedForecastChange)}.`
        : impliedForecastChange < 0
          ? `If no more spend today: overall forecast falls by ${formatCurrency(-impliedForecastChange)}.`
          : 'If no more spend today: overall forecast unchanged.'
      : null

  return (
    <Card className="border-l-[3px] border-l-amber-500">
      <CardHeader className="bg-muted/50">
        <CardTitle className="text-xl">Today&apos;s spend by forecast methodology</CardTitle>
        <p className="text-sm text-muted-foreground">
          Bar = today&apos;s spend; lighter segment = headroom (how much more you can spend in that methodology before next day&apos;s overall forecast would be lower than today&apos;s).
        </p>
        {impliedChangeText != null && (
          <p className="text-sm font-medium text-foreground mt-1">{impliedChangeText}</p>
        )}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={chartData}
            margin={
              isMobile
                ? { top: 10, right: 10, left: 0, bottom: 5 }
                : { top: 20, right: 30, left: 20, bottom: 5 }
            }
          >
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: fontSizes.axisTick, fill: chartTheme.labelFill }}
              stroke={chartTheme.axisStroke}
            />
            <YAxis
              tickFormatter={formatCurrency}
              tick={{ fontSize: fontSizes.axisTick, fill: chartTheme.labelFill }}
              width={isMobile ? 48 : 60}
              stroke={chartTheme.axisStroke}
            />
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === 'spend') {
                  return [formatCurrency(value), 'Spend']
                }
                return [formatCurrency(value), 'Headroom (dashed cap)']
              }}
              contentStyle={{
                backgroundColor: chartTheme.tooltipBg,
                borderColor: chartTheme.tooltipBorder,
                color: chartTheme.tooltipText,
                fontSize: `${fontSizes.tooltipMin}px`,
              }}
            />
            <Bar dataKey="spend" name="spend" stackId="method" radius={[4, 0, 0, 0]} stroke="transparent">
              {chartData.map((_, index) => (
                <Cell key={`spend-${index}`} fill={index % 2 === 0 ? SPEND_FILL : SPEND_FILL_ALT} />
              ))}
            </Bar>
            <Bar
              dataKey="headroom"
              name="headroom"
              stackId="method"
              radius={[0, 4, 4, 0]}
              stroke={chartTheme.axisStroke}
              strokeDasharray="5 5"
              strokeWidth={2}
            >
              {chartData.map((_, index) => (
                <Cell key={`headroom-${index}`} fill={index % 2 === 0 ? HEADROOM_FILL : HEADROOM_FILL_ALT} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
