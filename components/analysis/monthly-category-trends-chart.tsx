'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { getChartFontSizes } from '@/lib/chart-styles'
import { TransactionLog } from '@/lib/types'
import { AlertCircle } from 'lucide-react'
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

interface MonthlyData {
  month: string // YYYY-MM format
  monthLabel: string // Display label like "2026-1"
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
  hideCard?: boolean
}

export function MonthlyCategoryTrendsChart({
  transactions,
  selectedCategory,
  getRateForDate,
  hideCard = false,
}: MonthlyCategoryTrendsChartProps) {
  const { currency } = useCurrency()
  const isMobile = useIsMobile()

  // Calculate monthly data with top transaction per month
  const chartData = useMemo(() => {
    if (!selectedCategory) return []

    // Always show all 13 months, even if there are no transactions

    // Calculate the expected 13-month range
    const today = new Date()
    const lastFullMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const endDate = new Date(today.getFullYear(), today.getMonth(), 0)
    const startDate = new Date(lastFullMonth.getFullYear(), lastFullMonth.getMonth() - 12, 1)

    // Generate all 13 months in the range
    const allMonths: string[] = []
    const currentMonth = new Date(startDate)
    
    // Generate exactly 13 months
    for (let i = 0; i < 13; i++) {
      const year = currentMonth.getFullYear()
      const month = currentMonth.getMonth() + 1 // Convert 0-indexed to 1-indexed
      const monthKey = `${year}-${String(month).padStart(2, '0')}`
      allMonths.push(monthKey)
      // Move to next month
      currentMonth.setMonth(currentMonth.getMonth() + 1)
    }
    
    // Debug: log date range and generated months
    console.log('MonthlyCategoryTrendsChart - Date range:', {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      allMonths,
    })

    // Filter transactions for selected category
    const categoryTransactions = transactions.filter((tx) => tx.category === selectedCategory)
    
    // Debug logging
    console.log('MonthlyCategoryTrendsChart - Debug:', {
      totalTransactions: transactions.length,
      selectedCategory,
      categoryTransactionsCount: categoryTransactions.length,
      allMonths,
    })

    // Group transactions by month
    const monthlyGroups = new Map<string, TransactionLog[]>()
    
    categoryTransactions.forEach((tx) => {
      if (!tx.date) return
      
      // Parse date string directly to avoid timezone issues
      const dateStr = typeof tx.date === 'string' ? tx.date.split('T')[0] : new Date(tx.date).toISOString().split('T')[0]
      const [yearStr, monthStr] = dateStr.split('-')
      
      if (!yearStr || !monthStr) {
        console.warn('Invalid date format:', tx.date, 'parsed as:', dateStr)
        return
      }
      
      const year = parseInt(yearStr, 10)
      const month = parseInt(monthStr, 10)
      
      if (isNaN(year) || isNaN(month)) {
        console.warn('Invalid date values:', { yearStr, monthStr, dateStr, originalDate: tx.date })
        return
      }
      
      const monthKey = `${year}-${String(month).padStart(2, '0')}`
      
      if (!monthlyGroups.has(monthKey)) {
        monthlyGroups.set(monthKey, [])
      }
      monthlyGroups.get(monthKey)!.push(tx)
    })
    
    // Debug: log which months have transactions
    console.log('MonthlyCategoryTrendsChart - Monthly groups:', {
      monthsWithTransactions: Array.from(monthlyGroups.keys()),
      transactionCountsByMonth: Array.from(monthlyGroups.entries()).map(([month, txs]) => ({ month, count: txs.length })),
    })

    // First, find the top transaction across ALL months by aggregating all transactions
    // Group by first 7 letters of counterparty name
    const allCounterpartyTotals = new Map<string, { total: number; fullName: string }>()
    
    categoryTransactions.forEach((tx) => {
      const rate = getRateForDate(typeof tx.date === 'string' ? tx.date.split('T')[0] : tx.date)
      const amount = currency === 'USD'
        ? (tx.amount_usd ?? (tx.amount_gbp != null ? tx.amount_gbp * rate : 0))
        : (tx.amount_gbp ?? (tx.amount_usd != null ? tx.amount_usd / rate : 0))
      
      // Expenses are stored as negative values, only include negative amounts (expenses)
      if (amount < 0) {
        const absAmount = Math.abs(amount)
        const counterparty = tx.counterparty || 'Unknown'
        const counterpartyKey = counterparty.substring(0, 7).trim() // First 7 letters
        
        if (allCounterpartyTotals.has(counterpartyKey)) {
          const existing = allCounterpartyTotals.get(counterpartyKey)!
          existing.total += absAmount
          // Keep the full name from the first occurrence (or longest)
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

    // Find the top counterparty pattern across all months
    let topCounterpartyKey = ''
    let topCounterpartyFullName = ''
    let topTotalAmount = 0

    allCounterpartyTotals.forEach((data, key) => {
      if (data.total > topTotalAmount) {
        topTotalAmount = data.total
        topCounterpartyKey = key
        topCounterpartyFullName = data.fullName
      }
    })

    // Process each month in the range (including months with no transactions)
    const monthlyData: MonthlyData[] = []
    
    allMonths.forEach((monthKey) => {
      const monthTransactions = monthlyGroups.get(monthKey) || []
      
      // Calculate amounts for this month, separating the top transaction from others
      let topTransactionAmount = 0
      let totalAmount = 0
      
      monthTransactions.forEach((tx) => {
        const rate = getRateForDate(typeof tx.date === 'string' ? tx.date.split('T')[0] : tx.date)
        const amount = currency === 'USD'
          ? (tx.amount_usd ?? (tx.amount_gbp != null ? tx.amount_gbp * rate : 0))
          : (tx.amount_gbp ?? (tx.amount_usd != null ? tx.amount_usd / rate : 0))
        
        // Expenses are stored as negative values, only include negative amounts (expenses)
        if (amount < 0) {
          const absAmount = Math.abs(amount)
          totalAmount += absAmount
          
          // Check if this transaction matches the top counterparty pattern (first 7 letters)
          const counterparty = tx.counterparty || 'Unknown'
          const counterpartyKey = counterparty.substring(0, 7).trim()
          
          if (counterpartyKey === topCounterpartyKey) {
            topTransactionAmount += absAmount
          }
        }
      })

      // Calculate "other" amount (total minus top transaction)
      const otherAmount = totalAmount - topTransactionAmount

      // Format month label (e.g., "2026-1" for January 2026)
      const [year, month] = monthKey.split('-')
      const monthLabel = `${year}-${parseInt(month)}`

      monthlyData.push({
        month: monthKey,
        monthLabel,
        topTransactionCounterparty: topCounterpartyFullName || '',
        topTransactionAmount: topTransactionAmount,
        otherAmount,
        total: totalAmount,
        trendLine: 0, // Will be calculated below
      })
    })

    // Calculate trend line using 3-month moving average
    monthlyData.forEach((data, index) => {
      if (index < 2) {
        // For first 2 months, use the value itself (not enough data for moving average)
        data.trendLine = data.total
      } else {
        // Calculate 3-month moving average ending at this month
        const values = []
        for (let i = Math.max(0, index - 2); i <= index; i++) {
          values.push(monthlyData[i].total)
        }
        data.trendLine = values.reduce((sum, val) => sum + val, 0) / values.length
      }
    })

    // Highlight only the last full month (most recent in chart)
    // Reuse the lastFullMonth Date object calculated above
    const lastFullMonthKey = `${lastFullMonth.getFullYear()}-${String(lastFullMonth.getMonth() + 1).padStart(2, '0')}`

    monthlyData.forEach((data) => {
      if (data.month === lastFullMonthKey) {
        data.isHighlighted = true
      }
    })

    return monthlyData
  }, [transactions, selectedCategory, currency, getRateForDate])

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
          <CardTitle>Monthly Category Trends</CardTitle>
        </CardHeader>
        <CardContent>
          {emptyContent}
        </CardContent>
      </Card>
    )
  }

  const fontSizes = getChartFontSizes(isMobile)

  const chartContent = (
    <ResponsiveContainer width="100%" height={400}>
          <ComposedChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
            barCategoryGap="10%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="monthLabel"
              tick={(props) => {
                const { x, y, payload } = props
                const isLastMonth = payload.value === chartData[chartData.length - 1]?.monthLabel
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text
                      x={0}
                      y={0}
                      dy={16}
                      textAnchor="end"
                      fill="#6b7280"
                      fontSize={fontSizes.axisTick}
                      fontWeight={isLastMonth ? 'bold' : 'normal'}
                      transform={`rotate(-45)`}
                    >
                      {payload.value}
                    </text>
                  </g>
                )
              }}
              stroke="#6b7280"
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
              tick={{ fontSize: fontSizes.axisTick }}
              stroke="#6b7280"
              width={isMobile ? 48 : 60}
            />
            <Tooltip
              formatter={(value: number, name: string, props: any) => {
                const dataPoint = props.payload
                if (name === 'topTransactionAmount') {
                  return [
                    formatCurrency(value),
                    dataPoint?.topTransactionCounterparty 
                      ? `${selectedCategory} - ${dataPoint.topTransactionCounterparty}`
                      : `${selectedCategory} - Top Transaction`,
                  ]
                }
                if (name === 'trendLine') {
                  return [formatCurrency(value), 'Trend (3M Avg)']
                }
                return [formatCurrency(value), `${selectedCategory} - Other`]
              }}
              labelFormatter={(label) => {
                const dataPoint = chartData.find((d) => d.monthLabel === label)
                if (dataPoint) {
                  const [year, month] = dataPoint.month.split('-')
                  return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-GB', {
                    month: 'long',
                    year: 'numeric',
                  })
                }
                return label
              }}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: fontSizes.tooltipMin,
              }}
            />
            <Legend
              formatter={(value) => {
                if (value === 'topTransactionAmount') {
                  const currentData = chartData[chartData.length - 1]
                  return currentData 
                    ? `${selectedCategory} - ${currentData.topTransactionCounterparty}`
                    : `${selectedCategory} - Top Transaction`
                }
                if (value === 'trendLine') {
                  return 'Trend (3M Avg)'
                }
                return `${selectedCategory} - Other`
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
              <LabelList
                dataKey="total"
                position="top"
                offset={10}
                content={(props: any) => {
                  const x = Number(props.x ?? 0)
                  const y = Number(props.y ?? 0)
                  const width = Number(props.width ?? 0)
                  const payload = props.payload
                  
                  if (!payload || chartData.length === 0) return null
                  
                  // Find the index in chartData by matching the monthLabel
                  const monthLabel = payload.monthLabel
                  const dataIndex = chartData.findIndex((d) => d.monthLabel === monthLabel)
                  
                  if (dataIndex === -1) return null
                  
                  // Use index to identify first (0) and last (chartData.length - 1) months
                  const isFirstMonth = dataIndex === 0
                  const isLastMonth = dataIndex === chartData.length - 1
                  
                  // Only show label for first and last months
                  if (!isFirstMonth && !isLastMonth) {
                    return null
                  }
                  
                  const value = payload?.total || 0
                  if (value === 0) return null
                  
                  // Position label above the bar
                  // For stacked bars, y is the top of the top segment (which is the top of the stack)
                  const labelY = y - 12
                  
                  return (
                    <g transform={`translate(${x + width / 2},${labelY})`}>
                      <text
                        textAnchor="middle"
                        dy={0}
                        fill="#374151"
                        fontSize={fontSizes.axisTick}
                        fontWeight={500}
                      >
                        {formatCurrency(value)}
                      </text>
                    </g>
                  )
                }}
              />
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
                  const { x, y, payload } = props
                  if (!payload || chartData.length === 0) return null
                  
                  // Only show label for the last month (most recent)
                  const isLastMonth = payload.monthLabel === chartData[chartData.length - 1]?.monthLabel
                  if (!isLastMonth) return null
                  
                  const value = payload?.trendLine || 0
                  if (value === 0) return null
                  
                  return (
                    <g transform={`translate(${x},${y - 12})`}>
                      <text
                        textAnchor="middle"
                        dy={0}
                        fill="#6b7280"
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
  )

  if (hideCard) {
    return chartContent
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Category Trends</CardTitle>
      </CardHeader>
      <CardContent>
        {chartContent}
      </CardContent>
    </Card>
  )
}
