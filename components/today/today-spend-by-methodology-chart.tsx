'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { useChartTheme } from '@/lib/hooks/use-chart-theme'
import { getChartFontSizes, getChartTooltipContentStyle, getChartTooltipWrapperStyle } from '@/lib/chart-styles'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts'

/** All methodologies for spend; headroom only for Annual and Linear. */
const METHODOLOGY_ORDER = ['Annual', 'Linear', 'Budget', 'Manual'] as const
const SPEND_FILL = '#64748b'
const SPEND_FILL_ALT = '#475569'
/** Light green for headroom */
const HEADROOM_FILL = '#86efac'
const HEADROOM_FILL_ALT = '#bbf7d0'
const HEADROOM_LABEL_FILL = '#16a34a'

type TodaySpendByMethodologyChartProps = {
  spendByMethodology: Record<string, number>
  headroomByMethodology: Record<string, number | null>
  /** Sum of annual budgets per methodology; exclude methodology from chart if 0. */
  budgetSumByMethodology?: Record<string, number>
  /** Implied change in overall forecast if no more spend today (tomorrow − today). Positive = rises. */
  impliedForecastChange?: number | null
  /** Total forecast as of end of previous day (stable for the day); shown when finite. */
  totalForecastToday?: number | null
  /** Total forecast at end of day if no more spend today; shown when finite. */
  totalForecastTomorrowAtZero?: number | null
  /** When provided, bars are clickable and this is called with the methodology name. */
  onBarClick?: (methodology: string) => void
}

export function TodaySpendByMethodologyChart({
  spendByMethodology,
  headroomByMethodology,
  budgetSumByMethodology,
  impliedForecastChange,
  totalForecastToday,
  totalForecastTomorrowAtZero,
  onBarClick,
}: TodaySpendByMethodologyChartProps) {
  const { currency, fxRate, convertAmount } = useCurrency()

  const toDisplay = (gbp: number) =>
    currency === 'USD' ? convertAmount(gbp, 'GBP', fxRate) : gbp
  const isMobile = useIsMobile()
  const chartTheme = useChartTheme()

  const chartData = useMemo(() => {
    const filtered = METHODOLOGY_ORDER.filter((method) => {
      if (budgetSumByMethodology == null) return true
      const budgetSum = budgetSumByMethodology[method] ?? 0
      const spend = Number(spendByMethodology[method]) || 0
      const headroomRaw = headroomByMethodology[method]
      const remainingHeadroom =
        (method === 'Annual' || method === 'Linear') &&
        headroomRaw != null &&
        Number.isFinite(headroomRaw)
          ? Math.max(0, headroomRaw)
          : 0
      const hasHeadroom = remainingHeadroom > 0
      return Number(budgetSum) > 0 || spend > 0 || hasHeadroom
    })
    if (filtered.length === 0) {
      return METHODOLOGY_ORDER.map((method) => {
        const spend = Number(spendByMethodology[method]) || 0
        const headroomRaw = headroomByMethodology[method]
        const headroomVal =
          (method === 'Annual' || method === 'Linear') &&
          headroomRaw != null &&
          Number.isFinite(headroomRaw)
            ? Math.max(0, headroomRaw)
            : 0
        return { name: method, spend, headroom: headroomVal }
      })
    }
    return filtered.map((method) => {
      const spend = Number(spendByMethodology[method]) || 0
      const headroomRaw = headroomByMethodology[method]
      const headroomVal =
        (method === 'Annual' || method === 'Linear') &&
        headroomRaw != null &&
        Number.isFinite(headroomRaw)
          ? Math.max(0, headroomRaw)
          : 0
      return { name: method, spend, headroom: headroomVal }
    })
  }, [spendByMethodology, headroomByMethodology, budgetSumByMethodology])

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

  const startingForecastText =
    totalForecastToday != null && Number.isFinite(totalForecastToday)
      ? `Starting forecast today: ${formatCurrency(toDisplay(totalForecastToday))}. `
      : ''

  const displayedChange =
    impliedForecastChange != null && Number.isFinite(impliedForecastChange)
      ? toDisplay(impliedForecastChange)
      : null

  const impliedChangeText =
    displayedChange != null
      ? startingForecastText +
        (displayedChange > 0
          ? `By tomorrow, if you spend nothing else today, overall forecast rises by ${formatCurrency(displayedChange)} vs the start of today.`
          : displayedChange < 0
            ? `By tomorrow, if you spend nothing else today, overall forecast falls by ${formatCurrency(-displayedChange)} vs the start of today.`
            : 'By tomorrow, if you spend nothing else today, overall forecast is unchanged vs the start of today.')
      : startingForecastText
        ? startingForecastText.slice(0, -1)
        : null

  const impliedChangeClassName =
    displayedChange != null
      ? displayedChange > 0
        ? 'text-sm font-bold text-red-600 dark:text-red-400 mt-1'
        : displayedChange < 0
          ? 'text-sm font-bold text-green-600 dark:text-green-400 mt-1'
          : 'text-sm font-bold text-foreground mt-1'
      : 'text-sm font-bold text-foreground mt-1'

  return (
    <Card className="border-l-[3px] border-l-slate-500">
      <CardHeader className="bg-muted/50">
        <CardTitle className="text-xl">Today&apos;s spend by forecast methodology</CardTitle>
        <p className="text-sm text-muted-foreground">
          Bar = today&apos;s spend; lighter segment = room to spend by methodology (not the forecast change below).
        </p>
        {impliedChangeText != null && (
          <div className="mt-2 rounded-md bg-muted/70 px-3 py-2">
            <p className={impliedChangeClassName}>{impliedChangeText}</p>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={chartData}
            margin={
              isMobile
                ? { top: 10, right: 60, left: 0, bottom: 8 }
                : { top: 20, right: 80, left: 20, bottom: 8 }
            }
            barCategoryGap="18%"
          >
            <XAxis
              dataKey="name"
              tick={{ fontSize: fontSizes.axisTick, fill: chartTheme.labelFill }}
              stroke={chartTheme.axisStroke}
            />
            <YAxis
              domain={[0, (dataMax: number) => (typeof dataMax === 'number' && dataMax > 0 ? Math.ceil(dataMax * 1.08) : 1)]}
              width={0}
              axisLine={false}
              tick={false}
              tickLine={false}
            />
            <Tooltip
              wrapperStyle={getChartTooltipWrapperStyle(chartTheme)}
              formatter={(value: number, name: string) => {
                if (name?.toLowerCase() === 'spend') {
                  return [formatCurrency(value), 'Spend']
                }
                return [formatCurrency(value), 'Room to spend']
              }}
              contentStyle={getChartTooltipContentStyle(chartTheme, { fontSize: fontSizes.tooltipMin, isMobile })}
            />
            <Legend
              wrapperStyle={{
                paddingTop: isMobile ? '10px' : '16px',
                fontSize: fontSizes.legend,
              }}
              iconType="square"
              iconSize={fontSizes.iconSize}
              formatter={(value) => (
                <span style={{ fontSize: fontSizes.legend, marginRight: isMobile ? '16px' : '24px' }}>
                  {value}
                </span>
              )}
            />
            <Bar
              dataKey="spend"
              name="Spend"
              stackId="method"
              radius={[4, 0, 0, 0]}
              stroke="transparent"
              fill={SPEND_FILL}
              cursor={onBarClick ? 'pointer' : undefined}
              onClick={onBarClick ? (data: { name?: string }) => data?.name != null && onBarClick(data.name) : undefined}
            >
              {chartData.map((_, index) => (
                <Cell key={`spend-${index}`} fill={index % 2 === 0 ? SPEND_FILL : SPEND_FILL_ALT} />
              ))}
            </Bar>
            <Bar
              dataKey="headroom"
              name="Room to spend"
              stackId="method"
              radius={[0, 4, 4, 0]}
              stroke="transparent"
              fill={HEADROOM_FILL}
              cursor={onBarClick ? 'pointer' : undefined}
              onClick={onBarClick ? (data: { name?: string }) => data?.name != null && onBarClick(data.name) : undefined}
            >
              {chartData.map((_, index) => (
                <Cell key={`headroom-${index}`} fill={index % 2 === 0 ? HEADROOM_FILL : HEADROOM_FILL_ALT} />
              ))}
              <LabelList
                dataKey="headroom"
                position="top"
                formatter={(value: number) => (value != null && value > 0 ? formatCurrency(value) : '')}
                style={{ fontSize: fontSizes.axisTick, fill: HEADROOM_LABEL_FILL, fontWeight: 'bold' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
