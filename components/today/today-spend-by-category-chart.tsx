'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { useChartTheme } from '@/lib/hooks/use-chart-theme'
import { getChartFontSizes } from '@/lib/chart-styles'
import { BarChart2 } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts'

/** Distinct per-category palette (works in light and dark). */
const BAR_COLORS = [
  '#0ea5e9', // sky
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#64748b', // slate
]

type TodaySpendByCategoryChartProps = {
  spendByCategory: Record<string, number>
  /** When provided, bars are clickable and this is called with the category name. */
  onBarClick?: (category: string) => void
}

export function TodaySpendByCategoryChart({ spendByCategory, onBarClick }: TodaySpendByCategoryChartProps) {
  const { currency } = useCurrency()
  const isMobile = useIsMobile()
  const chartTheme = useChartTheme()

  const chartData = useMemo(() => {
    const entries = Object.entries(spendByCategory)
      .filter(([, v]) => Number.isFinite(v) && v > 0)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
    return entries
  }, [spendByCategory])

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

  if (chartData.length === 0) {
    return (
      <Card className="border-l-[3px] border-l-slate-500">
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Today&apos;s spend by category</CardTitle>
          <p className="text-sm text-muted-foreground">Expense by category for today</p>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={BarChart2}
            title="No spend by category"
            description="No expense data for today to show by category."
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-l-[3px] border-l-slate-500">
      <CardHeader className="bg-muted/50">
        <CardTitle className="text-xl">Today&apos;s spend by category</CardTitle>
        <p className="text-sm text-muted-foreground">Expense by category for today</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={chartData}
            margin={
              isMobile
                ? { top: 10, right: 10, left: 0, bottom: 56 }
                : { top: 20, right: 30, left: 20, bottom: 8 }
            }
            barCategoryGap="18%"
          >
            <XAxis
              dataKey="name"
              tick={{ fontSize: fontSizes.axisTick, fill: chartTheme.labelFill }}
              stroke={chartTheme.axisStroke}
              angle={isMobile ? -45 : 0}
              textAnchor={isMobile ? 'end' : 'middle'}
              interval={isMobile && chartData.length > 6 ? 'preserveStartEnd' : 0}
            />
            <YAxis
              domain={[0, (dataMax: number) => (typeof dataMax === 'number' && dataMax > 0 ? Math.ceil(dataMax * 1.08) : 1)]}
              width={0}
              axisLine={false}
              tick={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value: number) => [formatCurrency(value), 'Spend']}
              contentStyle={{
                backgroundColor: chartTheme.tooltipBg,
                borderColor: chartTheme.tooltipBorder,
                color: chartTheme.tooltipText,
                borderRadius: '6px',
                padding: isMobile ? '6px 10px' : '8px 12px',
                fontSize: `${fontSizes.tooltipMin}px`,
              }}
            />
            <Bar
              dataKey="value"
              radius={[4, 4, 0, 0]}
              stroke="transparent"
              cursor={onBarClick ? 'pointer' : undefined}
              onClick={onBarClick ? (data: { name?: string }) => data?.name != null && onBarClick(data.name) : undefined}
            >
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                formatter={(value: number) => (value != null ? formatCurrency(value) : '')}
                style={{ fontSize: fontSizes.axisTick, fill: chartTheme.labelFill }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
