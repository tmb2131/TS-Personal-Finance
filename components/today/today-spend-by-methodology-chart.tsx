'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { useChartTheme } from '@/lib/hooks/use-chart-theme'
import { getChartFontSizes } from '@/lib/chart-styles'
import { Target } from 'lucide-react'
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
}

export function TodaySpendByMethodologyChart({
  spendByMethodology,
  headroomByMethodology,
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

  const hasAnySpend = chartData.some((d) => d.spend > 0)

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

  if (!hasAnySpend) {
    return (
      <Card className="border-l-[3px] border-l-amber-500">
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Today&apos;s spend by forecast methodology</CardTitle>
          <p className="text-sm text-muted-foreground">
            Expense by method (Annual, Budget, Linear, Manual). Dashed line = spend + headroom before next day&apos;s forecast drops.
          </p>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Target}
            title="No spend by methodology"
            description="No expense data for today to show by forecast methodology."
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-l-[3px] border-l-amber-500">
      <CardHeader className="bg-muted/50">
        <CardTitle className="text-xl">Today&apos;s spend by forecast methodology</CardTitle>
        <p className="text-sm text-muted-foreground">
          Bar = today&apos;s spend; lighter segment = headroom (how much more you can spend in that methodology before next day&apos;s overall forecast would be lower than today&apos;s).
        </p>
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
