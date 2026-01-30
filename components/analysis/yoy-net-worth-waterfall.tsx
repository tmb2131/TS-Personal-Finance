'use client'

import { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useCurrency } from '@/lib/contexts/currency-context'
import { createClient } from '@/lib/supabase/client'
import { YoYNetWorth } from '@/lib/types'
import { TrendingUp, AlertCircle } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts'

export function YoYNetWorthWaterfall() {
  const { currency } = useCurrency()
  const [data, setData] = useState<YoYNetWorth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const { data: netWorthData, error } = await supabase
        .from('yoy_net_worth')
        .select('*')
        .order('category')

      if (error) {
        console.error('Error fetching YoY Net Worth:', error)
        setError('Failed to load year-over-year net worth data. Please try refreshing the page.')
        setLoading(false)
        return
      }
      
      setError(null)

      setData((netWorthData as YoYNetWorth[]) || [])
      setLoading(false)
    }

    fetchData()
  }, [currency])

  // Extract Year Start and Year End values for summary
  const summaryValues = useMemo(() => {
    const yearStart = data.find((item) => item.category === 'Year Start')
    const yearEnd = data.find((item) => item.category === 'Year End')
    
    return {
      yearStart: yearStart ? (currency === 'USD' ? yearStart.amount_usd : yearStart.amount_gbp) : null,
      yearEnd: yearEnd ? (currency === 'USD' ? yearEnd.amount_usd : yearEnd.amount_gbp) : null,
    }
  }, [data, currency])

  // Transform data into waterfall format showing cumulative progression
  const waterfallData = useMemo(() => {
    if (data.length === 0) return []

    const orderedCategories = [
      'Year Start',
      'Income',
      'Other Income',
      'Gift Money',
      'Expenses',
      'Taconic/Other YTD',
      'Transfer to Kiran',
      'Transfer to HMRC',
      'Year End',
    ]

    // Filter and order data
    const orderedData = orderedCategories
      .map((cat) => data.find((item) => item.category === cat))
      .filter(Boolean) as YoYNetWorth[]

    if (orderedData.length === 0) return []

    // Get Year Start value for calculating running total
    const yearStartItem = orderedData.find((item) => item.category === 'Year Start')
    let runningTotal = yearStartItem 
      ? (currency === 'USD' ? yearStartItem.amount_usd : yearStartItem.amount_gbp) || 0
      : 0

    // Build waterfall data (excluding Year Start and Year End)
    const waterfall: any[] = []

    orderedData.forEach((item) => {
      const amount = currency === 'USD' ? item.amount_usd : item.amount_gbp
      const isStart = item.category === 'Year Start'
      const isEnd = item.category === 'Year End'

      // Skip Year Start and Year End from chart
      if (isStart || isEnd) {
        return
      }

      const change = amount || 0
      
      // Skip zero values
      if (change === 0) {
        return
      }
      
      const start = runningTotal
      runningTotal += change
      const end = runningTotal

      waterfall.push({
        name: item.category,
        value: change,
        start,
        end,
        type: change >= 0 ? 'positive' : 'negative',
      })
    })

    // Sort in descending order by actual value (not absolute)
    waterfall.sort((a, b) => b.value - a.value)

    // Add Net Change bar at the end
    if (summaryValues.yearStart !== null && summaryValues.yearEnd !== null) {
      const netChange = summaryValues.yearEnd - summaryValues.yearStart
      waterfall.push({
        name: 'Net Change',
        value: netChange,
        start: summaryValues.yearStart,
        end: summaryValues.yearEnd,
        type: netChange >= 0 ? 'net-positive' : 'net-negative',
      })
    }

    return waterfall
  }, [data, currency, summaryValues])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value)
  }

  const formatCurrencyFull = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatCurrencyLarge = (value: number | null) => {
    if (value === null || value === undefined) return '-'
    const valueInM = Math.abs(value) / 1000000
    const currencySymbol = currency === 'USD' ? '$' : '£'
    if (valueInM >= 1) {
      return `${currencySymbol}${valueInM.toFixed(1)}M`
    }
    const valueInK = Math.abs(value) / 1000
    return `${currencySymbol}${valueInK.toFixed(1)}k`
  }

  const getBarColor = (type: string) => {
    switch (type) {
      case 'start':
      case 'end':
        return '#8884d8' // Purple for start/end
      case 'positive':
        return '#82ca9d' // Green for positive
      case 'negative':
        return '#ff7c7c' // Red for negative
      case 'net-positive':
        return '#22c55e' // Darker green for net positive
      case 'net-negative':
        return '#ef4444' // Darker red for net negative
      default:
        return '#8884d8'
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <Skeleton className="h-6 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2 pt-2 pb-6 border-b">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-4 w-48" />
              ))}
            </div>
            <Skeleton className="h-96 w-full" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Year-over-Year Net Worth Change</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={AlertCircle}
            title="Error loading data"
            description={error}
          />
        </CardContent>
      </Card>
    )
  }

  if (waterfallData.length === 0) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Year-over-Year Net Worth Change</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={TrendingUp}
            title="No net worth data available"
            description="Year-over-year net worth change data has not been synced yet. Please refresh the data to load this information."
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="bg-muted/50">
        <CardTitle className="text-xl">Year-over-Year Net Worth Change</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Summary bullets */}
        {(summaryValues.yearStart !== null || summaryValues.yearEnd !== null) && (
          <div className="mb-6 space-y-2 pt-2 pb-6 border-b">
            {summaryValues.yearStart !== null && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Year Start:</span>
                <span className="text-sm font-semibold">{formatCurrencyLarge(summaryValues.yearStart)}</span>
              </div>
            )}
            {summaryValues.yearEnd !== null && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Year End:</span>
                <span className="text-sm font-semibold">{formatCurrencyLarge(summaryValues.yearEnd)}</span>
              </div>
            )}
            {summaryValues.yearStart !== null && summaryValues.yearEnd !== null && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-sm font-medium text-muted-foreground">Net Change:</span>
                <span className={`text-sm font-semibold ${
                  (summaryValues.yearEnd - summaryValues.yearStart) >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {(summaryValues.yearEnd - summaryValues.yearStart) >= 0 ? '+' : ''}
                  {formatCurrencyLarge(summaryValues.yearEnd - summaryValues.yearStart)}
                </span>
              </div>
            )}
          </div>
        )}
        <ResponsiveContainer width="100%" height={500}>
          <BarChart
            data={waterfallData}
            margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={100}
              tick={{ fontSize: 12 }}
              stroke="#6b7280"
              tick={(props: any) => {
                const { x, y, payload } = props
                const isNetChange = payload.value === 'Net Change'
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text
                      x={0}
                      y={0}
                      dy={16}
                      textAnchor="end"
                      fill={isNetChange ? '#000' : '#6b7280'}
                      fontSize={isNetChange ? 13 : 12}
                      fontWeight={isNetChange ? 'bold' : 'normal'}
                      transform="rotate(-45)"
                    >
                      {payload.value}
                    </text>
                  </g>
                )
              }}
            />
            <YAxis
              tickFormatter={formatCurrency}
              tick={{ fontSize: 12 }}
              stroke="#6b7280"
            />
            <Tooltip
              formatter={(value: number, name: string, props: any) => {
                if (props.payload.type === 'start' || props.payload.type === 'end') {
                  return formatCurrencyFull(value)
                }
                const sign = value >= 0 ? '+' : ''
                return `${sign}${formatCurrencyFull(value)}`
              }}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: '8px 12px',
              }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} stroke="#fff" strokeWidth={1}>
              {waterfallData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={getBarColor(entry.type)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
