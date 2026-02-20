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
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

const BAR_COLORS = ['#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f', '#fbbf24', '#fcd34d']

type TodaySpendByCategoryChartProps = {
  spendByCategory: Record<string, number>
}

export function TodaySpendByCategoryChart({ spendByCategory }: TodaySpendByCategoryChartProps) {
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
      <Card className="border-l-[3px] border-l-amber-500">
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
    <Card className="border-l-[3px] border-l-amber-500">
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
                ? { top: 10, right: 10, left: 0, bottom: 5 }
                : { top: 20, right: 30, left: 20, bottom: 5 }
            }
          >
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: fontSizes.axisTick, fill: chartTheme.labelFill }}
              stroke={chartTheme.axisStroke}
              angle={isMobile ? -45 : 0}
              textAnchor={isMobile ? 'end' : 'middle'}
              interval={0}
            />
            <YAxis
              tickFormatter={formatCurrency}
              tick={{ fontSize: fontSizes.axisTick, fill: chartTheme.labelFill }}
              width={isMobile ? 48 : 60}
              stroke={chartTheme.axisStroke}
            />
            <Tooltip
              formatter={(value: number) => [formatCurrency(value), 'Spend']}
              contentStyle={{
                backgroundColor: chartTheme.tooltipBg,
                borderColor: chartTheme.tooltipBorder,
                color: chartTheme.tooltipText,
                fontSize: `${fontSizes.tooltipMin}px`,
              }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} stroke="transparent">
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
