'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { useChartTheme } from '@/lib/hooks/use-chart-theme'
import { getChartFontSizes, getChartTooltipContentStyle, getChartTooltipWrapperStyle } from '@/lib/chart-styles'
import { TransactionLog } from '@/lib/types'
import { AlertCircle } from 'lucide-react'
import type { ViewMode } from './monthly-category-trends-section'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts'

const EXCLUDED_CATEGORIES = ['Income', 'Gift Money', 'Other Income', 'Excluded']

// Colors matching the example: light blue for top transaction, light red/pink for rest
const TOP_TRANSACTION_FILL = '#93c5fd' // Light blue
const TOP_TRANSACTION_FILL_HIGHLIGHT = '#3b82f6' // Dark blue
const OTHER_FILL = '#fca5a5' // Light red/pink
const OTHER_FILL_HIGHLIGHT = '#dc2626' // Dark red

interface ChartDataPoint {
  period: string // YYYY-MM or YYYY-Wxx format
  periodLabel: string // Display label
  topTransactionCounterparty: string
  topTransactionAmount: number
  otherAmount: number
  total: number
  trendLine: number
  isHighlighted?: boolean
}

interface MonthlyCategoryTrendsChartProps {
  transactions: TransactionLog[]
  selectedCategory: string
  getRateForDate: (dateStr: string) => number
  viewMode?: ViewMode
  hideCard?: boolean
}

/** Get the ISO week number and year for a date (Monday-based weeks) */
function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return { year: d.getUTCFullYear(), week: weekNo }
}

/** Get the Monday of a given ISO week */
function getWeekStart(isoYear: number, isoWeek: number): Date {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4))
  const dayOfWeek = jan4.getUTCDay() || 7
  const monday = new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (isoWeek - 1) * 7)
  return monday
}

export function MonthlyCategoryTrendsChart({
  transactions,
  selectedCategory,
  getRateForDate,
  viewMode = 'monthly',
  hideCard = false,
}: MonthlyCategoryTrendsChartProps) {
  const { currency } = useCurrency()
  const isMobile = useIsMobile()
  const chartTheme = useChartTheme()

  // Helper: get transaction amount in the current currency
  const getTxAmount = (tx: TransactionLog): number => {
    const rate = getRateForDate(typeof tx.date === 'string' ? tx.date.split('T')[0] : tx.date)
    return currency === 'USD'
      ? (tx.amount_usd ?? (tx.amount_gbp != null ? tx.amount_gbp * rate : 0))
      : (tx.amount_gbp ?? (tx.amount_usd != null ? tx.amount_usd / rate : 0))
  }

  // Find top counterparty across all category transactions
  const { topCounterpartyKey, topCounterpartyFullName } = useMemo(() => {
    const categoryTransactions = selectedCategory === 'Total Expenses'
      ? transactions
      : transactions.filter((tx) => tx.category === selectedCategory)

    const allCounterpartyTotals = new Map<string, { total: number; fullName: string }>()

    categoryTransactions.forEach((tx) => {
      const amount = getTxAmount(tx)
      if (amount < 0) {
        const absAmount = Math.abs(amount)
        const counterparty = tx.counterparty || 'Unknown'
        const counterpartyKey = counterparty.substring(0, 7).trim()

        if (allCounterpartyTotals.has(counterpartyKey)) {
          const existing = allCounterpartyTotals.get(counterpartyKey)!
          existing.total += absAmount
          if (counterparty.length > existing.fullName.length) {
            existing.fullName = counterparty
          }
        } else {
          allCounterpartyTotals.set(counterpartyKey, {
            total: absAmount,
            fullName: counterparty,
          })
        }
      }
    })

    let topKey = ''
    let topName = ''
    let topTotal = 0

    allCounterpartyTotals.forEach((data, key) => {
      if (data.total > topTotal) {
        topTotal = data.total
        topKey = key
        topName = data.fullName
      }
    })

    return { topCounterpartyKey: topKey, topCounterpartyFullName: topName }
  }, [transactions, selectedCategory, currency, getRateForDate])

  // Calculate chart data based on view mode
  const chartData = useMemo((): ChartDataPoint[] => {
    if (!selectedCategory) return []

    const categoryTransactions = selectedCategory === 'Total Expenses'
      ? transactions
      : transactions.filter((tx) => tx.category === selectedCategory)

    // Parse a transaction date into components
    const parseDateStr = (tx: TransactionLog): string | null => {
      if (!tx.date) return null
      const dateStr = typeof tx.date === 'string' ? tx.date.split('T')[0] : new Date(tx.date).toISOString().split('T')[0]
      return dateStr
    }

    // Process a group of transactions into amounts
    const processGroup = (txs: TransactionLog[]): { topAmount: number; otherAmount: number; total: number } => {
      let topAmount = 0
      let total = 0

      txs.forEach((tx) => {
        const amount = getTxAmount(tx)
        if (amount < 0) {
          const absAmount = Math.abs(amount)
          total += absAmount
          const counterparty = tx.counterparty || 'Unknown'
          const counterpartyKey = counterparty.substring(0, 7).trim()
          if (counterpartyKey === topCounterpartyKey) {
            topAmount += absAmount
          }
        }
      })

      return { topAmount, otherAmount: total - topAmount, total }
    }

    if (viewMode === 'weekly') {
      // WEEKLY VIEW: show ~13 weeks ending at the latest full week
      const today = new Date()
      const dayOfWeek = today.getUTCDay() || 7 // Mon=1, Sun=7
      // Latest full week ends on last Sunday
      const lastSunday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
      lastSunday.setUTCDate(lastSunday.getUTCDate() - dayOfWeek)
      // Go back 13 weeks from the Monday of the latest full week
      const lastFullWeekMonday = new Date(lastSunday)
      lastFullWeekMonday.setUTCDate(lastFullWeekMonday.getUTCDate() - 6)
      const startMonday = new Date(lastFullWeekMonday)
      startMonday.setUTCDate(startMonday.getUTCDate() - 12 * 7) // 12 more weeks back = 13 total

      // Generate 13 week keys
      const allWeeks: { key: string; label: string; year: number; week: number }[] = []
      const cursor = new Date(startMonday)
      for (let i = 0; i < 13; i++) {
        const { year, week } = getISOWeek(cursor)
        const weekKey = `${year}-W${String(week).padStart(2, '0')}`
        // Label: show the Monday date as "D Mon"
        const monthName = cursor.toLocaleDateString('en-GB', { month: 'short' })
        const dayNum = cursor.getUTCDate()
        const weekLabel = `${dayNum} ${monthName}`
        allWeeks.push({ key: weekKey, label: weekLabel, year, week })
        cursor.setUTCDate(cursor.getUTCDate() + 7)
      }

      // Group transactions by week
      const weeklyGroups = new Map<string, TransactionLog[]>()
      allWeeks.forEach(w => weeklyGroups.set(w.key, []))

      categoryTransactions.forEach((tx) => {
        const dateStr = parseDateStr(tx)
        if (!dateStr) return
        const [y, m, d] = dateStr.split('-').map(Number)
        const txDate = new Date(Date.UTC(y, m - 1, d))
        const { year, week } = getISOWeek(txDate)
        const weekKey = `${year}-W${String(week).padStart(2, '0')}`
        if (weeklyGroups.has(weekKey)) {
          weeklyGroups.get(weekKey)!.push(tx)
        }
      })

      // Build chart data
      const data: ChartDataPoint[] = allWeeks.map((w) => {
        const txs = weeklyGroups.get(w.key) || []
        const { topAmount, otherAmount, total } = processGroup(txs)
        return {
          period: w.key,
          periodLabel: w.label,
          topTransactionCounterparty: topCounterpartyFullName || '',
          topTransactionAmount: topAmount,
          otherAmount,
          total,
          trendLine: 0,
        }
      })

      // Highlight the last full week
      if (data.length > 0) {
        data[data.length - 1].isHighlighted = true
      }

      // 3-period moving average trend line
      data.forEach((d, i) => {
        if (i < 2) {
          d.trendLine = d.total
        } else {
          d.trendLine = (data[i - 2].total + data[i - 1].total + d.total) / 3
        }
      })

      return data
    }

    // MONTHLY VIEW (existing logic)
    const today = new Date()
    const lastFullMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const startDate = new Date(lastFullMonth.getFullYear(), lastFullMonth.getMonth() - 12, 1)

    const allMonths: string[] = []
    const currentMonth = new Date(startDate)
    for (let i = 0; i < 13; i++) {
      const year = currentMonth.getFullYear()
      const month = currentMonth.getMonth() + 1
      allMonths.push(`${year}-${String(month).padStart(2, '0')}`)
      currentMonth.setMonth(currentMonth.getMonth() + 1)
    }

    // Group transactions by month
    const monthlyGroups = new Map<string, TransactionLog[]>()
    allMonths.forEach(m => monthlyGroups.set(m, []))

    categoryTransactions.forEach((tx) => {
      const dateStr = parseDateStr(tx)
      if (!dateStr) return
      const [yearStr, monthStr] = dateStr.split('-')
      if (!yearStr || !monthStr) return
      const year = parseInt(yearStr, 10)
      const month = parseInt(monthStr, 10)
      if (isNaN(year) || isNaN(month)) return
      const monthKey = `${year}-${String(month).padStart(2, '0')}`
      if (monthlyGroups.has(monthKey)) {
        monthlyGroups.get(monthKey)!.push(tx)
      }
    })

    const data: ChartDataPoint[] = allMonths.map((monthKey) => {
      const txs = monthlyGroups.get(monthKey) || []
      const { topAmount, otherAmount, total } = processGroup(txs)
      const [year, month] = monthKey.split('-')
      return {
        period: monthKey,
        periodLabel: `${year}-${parseInt(month)}`,
        topTransactionCounterparty: topCounterpartyFullName || '',
        topTransactionAmount: topAmount,
        otherAmount,
        total,
        trendLine: 0,
      }
    })

    // 3-period moving average trend line
    data.forEach((d, i) => {
      if (i < 2) {
        d.trendLine = d.total
      } else {
        d.trendLine = (data[i - 2].total + data[i - 1].total + d.total) / 3
      }
    })

    // Highlight last full month
    const lastFullMonthKey = `${lastFullMonth.getFullYear()}-${String(lastFullMonth.getMonth() + 1).padStart(2, '0')}`
    data.forEach((d) => {
      if (d.period === lastFullMonthKey) {
        d.isHighlighted = true
      }
    })

    return data
  }, [transactions, selectedCategory, currency, getRateForDate, viewMode, topCounterpartyKey, topCounterpartyFullName])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  if (!selectedCategory) {
    const emptyContent = (
      <EmptyState
        icon={AlertCircle}
        title="No category selected"
        description="Please select a category to view monthly trends."
      />
    )
    
    if (hideCard) {
      return emptyContent
    }
    
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trends by Category</CardTitle>
        </CardHeader>
        <CardContent>
          {emptyContent}
        </CardContent>
      </Card>
    )
  }

  const fontSizes = getChartFontSizes(isMobile)

  // Get the top counterparty name for the explanation text
  const topCounterpartyName = chartData.length > 0 && chartData[0]?.topTransactionCounterparty
    ? chartData[0].topTransactionCounterparty
    : null

  const chartContent = (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={isMobile ? 260 : 320}>
        <ComposedChart
        data={chartData}
        margin={isMobile ? { top: 25, right: 10, left: 0, bottom: 5 } : { top: 30, right: 30, left: 20, bottom: 5 }}
            barCategoryGap="10%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
            <XAxis
              dataKey="periodLabel"
              tick={(props) => {
                const { x, y, payload } = props
                const isLastMonth = payload.value === chartData[chartData.length - 1]?.periodLabel
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text
                      x={0}
                      y={0}
                      dy={16}
                      textAnchor="end"
                      fill={chartTheme.labelFill}
                      fontSize={fontSizes.axisTick}
                      fontWeight={isLastMonth ? 'bold' : 'normal'}
                      transform={`rotate(-45)`}
                    >
                      {payload.value}
                    </text>
                  </g>
                )
              }}
              stroke={chartTheme.axisStroke}
              height={isMobile ? 80 : 100}
              interval="preserveStartEnd"
              minTickGap={isMobile ? 40 : 30}
            />
            <YAxis
              tickFormatter={(value) =>
                new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: currency,
                  notation: 'compact',
                  maximumFractionDigits: 0,
                }).format(value)
              }
              tick={{ fontSize: fontSizes.axisTick, fill: chartTheme.labelFill }}
              stroke={chartTheme.axisStroke}
              width={isMobile ? 48 : 60}
            />
            <Tooltip
              wrapperStyle={getChartTooltipWrapperStyle(chartTheme)}
              formatter={(value: number, name: string, props: any) => {
                const dataPoint = props.payload
                if (name === 'topTransactionAmount') {
                  return [
                    formatCurrency(value),
                    dataPoint?.topTransactionCounterparty 
                      ? `Largest: ${dataPoint.topTransactionCounterparty}`
                      : 'Largest Transaction Pattern',
                  ]
                }
                if (name === 'trendLine') {
                  return [formatCurrency(value), viewMode === 'weekly' ? 'Trend (3W Avg)' : 'Trend (3M Avg)']
                }
                return [formatCurrency(value), 'Other Spending']
              }}
              labelFormatter={(label) => {
                const dataPoint = chartData.find((d) => d.periodLabel === label)
                if (dataPoint) {
                  if (viewMode === 'weekly') {
                    // Show "Week of D Mon YYYY"
                    const parts = dataPoint.period.split('-W')
                    if (parts.length === 2) {
                      const wStart = getWeekStart(parseInt(parts[0]), parseInt(parts[1]))
                      return `Week of ${wStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
                    }
                  }
                  const [year, month] = dataPoint.period.split('-')
                  return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-GB', {
                    month: 'long',
                    year: 'numeric',
                  })
                }
                return label
              }}
              contentStyle={getChartTooltipContentStyle(chartTheme, { fontSize: fontSizes.tooltipMin, isMobile })}
            />
            <Legend
              formatter={(value) => {
                if (value === 'topTransactionAmount') {
                  const currentData = chartData[chartData.length - 1]
                  return currentData?.topTransactionCounterparty
                    ? `Largest: ${currentData.topTransactionCounterparty}`
                    : 'Largest Transaction Pattern'
                }
                if (value === 'trendLine') {
                  return viewMode === 'weekly' ? 'Trend (3W Avg)' : 'Trend (3M Avg)'
                }
                return 'Other Spending'
              }}
              wrapperStyle={{ fontSize: fontSizes.legend }}
              iconSize={fontSizes.iconSize}
            />
            <Bar
              dataKey="otherAmount"
              stackId="category"
              fill={OTHER_FILL}
              radius={[0, 0, 0, 0]}
              stroke="#fff"
              strokeWidth={1}
              minPointSize={2}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`other-cell-${index}`}
                  fill={entry.isHighlighted ? OTHER_FILL_HIGHLIGHT : OTHER_FILL}
                />
              ))}
            </Bar>
            <Bar
              dataKey="topTransactionAmount"
              stackId="category"
              fill={TOP_TRANSACTION_FILL}
              radius={[4, 4, 0, 0]}
              stroke="#fff"
              strokeWidth={1}
              minPointSize={2}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`top-cell-${index}`}
                  fill={entry.isHighlighted ? TOP_TRANSACTION_FILL_HIGHLIGHT : TOP_TRANSACTION_FILL}
                />
              ))}
            </Bar>
            <Line
              type="monotone"
              dataKey="trendLine"
              stroke="#6b7280"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              activeDot={{ r: 4 }}
              name="trendLine"
            >
              <LabelList
                dataKey="trendLine"
                position="top"
                offset={10}
                content={(props: any) => {
                  const { x, y } = props
                  const dataIndex = props.index ?? -1
                  if (dataIndex === -1 || chartData.length === 0) return null

                  // Find the index of the max trend value
                  const maxTrendIndex = chartData.reduce(
                    (maxI, d, i, arr) => d.trendLine > arr[maxI].trendLine ? i : maxI, 0
                  )
                  const isMaxTrend = dataIndex === maxTrendIndex
                  const isLastPeriod = dataIndex === chartData.length - 1

                  // Show label for the last period and the max trend period
                  if (!isLastPeriod && !isMaxTrend) return null

                  const value = chartData[dataIndex]?.trendLine || 0
                  if (value === 0) return null

                  return (
                    <g transform={`translate(${x},${y - 12})`}>
                      <text
                        textAnchor="middle"
                        dy={0}
                        fill={chartTheme.axisStroke}
                        fontSize={fontSizes.axisTick}
                        fontWeight={500}
                      >
                        {formatCurrency(value)}
                      </text>
                    </g>
                  )
                }}
              />
            </Line>
          </ComposedChart>
      </ResponsiveContainer>
      {topCounterpartyName && (
        <p className="text-xs text-muted-foreground text-center px-2 leading-relaxed">
          <span className="font-semibold" style={{ color: TOP_TRANSACTION_FILL_HIGHLIGHT }}>Largest transaction pattern:</span> The blue segment shows spending with{' '}
          <span className="font-medium">{topCounterpartyName}</span> (merchants matching the first 7 characters), 
          which is the highest-spending counterparty pattern across all {viewMode === 'weekly' ? '13 weeks' : '13 months'}. The red segment shows all other spending.
        </p>
      )}
    </div>
  )

  if (hideCard) {
    return chartContent
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trends by Category</CardTitle>
      </CardHeader>
      <CardContent>
        {chartContent}
      </CardContent>
    </Card>
  )
}
