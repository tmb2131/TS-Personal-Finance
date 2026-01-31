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
  LabelList,
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
      'Investment Return YTD',
      'Transfer to Kiran',
      'Transfer to HMRC',
      'Year End',
    ]

    // Filter and order data
    const orderedData = orderedCategories
      .map((cat) => data.find((item) => item.category === cat))
      .filter(Boolean) as YoYNetWorth[]

    if (orderedData.length === 0) return []

    // Year start for y-axis normalization and running total
    const yearStart = summaryValues.yearStart ?? 0

    // Collect change items (excluding Year Start and Year End), then sort by actual value descending; Net Change stays last.
    const changes: { name: string; value: number; type: string }[] = []

    orderedData.forEach((item) => {
      const amount = currency === 'USD' ? item.amount_usd : item.amount_gbp
      const isStart = item.category === 'Year Start'
      const isEnd = item.category === 'Year End'

      if (isStart || isEnd) return

      const change = amount || 0
      if (change === 0) return

      changes.push({
        name: item.category,
        value: change,
        type: change >= 0 ? 'positive' : 'negative',
      })
    })

    // Sort by actual value descending (largest positive first, then smaller positives, then negatives, smallest/most negative last)
    changes.sort((a, b) => b.value - a.value)

    // Build waterfall with running total in this order; values relative to year start for y-axis.
    const waterfall: any[] = []
    let runningTotal = yearStart

    changes.forEach((item) => {
      const start = runningTotal
      const end = start + item.value
      runningTotal = end
      const minAbs = Math.min(start, end)
      const delta = Math.abs(item.value)
      const min = minAbs - yearStart
      waterfall.push({
        name: item.name,
        value: item.value,
        start,
        end,
        min,
        delta,
        type: item.type,
      })
    })

    // Net Change bar always last
    if (summaryValues.yearStart !== null && summaryValues.yearEnd !== null) {
      const netChange = summaryValues.yearEnd - summaryValues.yearStart
      const start = summaryValues.yearStart
      const end = summaryValues.yearEnd
      const minAbs = Math.min(start, end)
      const delta = Math.abs(netChange)
      const min = minAbs - yearStart
      waterfall.push({
        name: 'Net Change',
        value: netChange,
        start,
        end,
        min,
        delta,
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

  // Waterfall bar colors: green/red for increases/decreases, darker for net change
  const getBarColor = (type: string) => {
    switch (type) {
      case 'positive':
        return '#22c55e' // Green for increase
      case 'negative':
        return '#ef4444' // Red for decrease
      case 'net-positive':
        return '#16a34a' // Darker green for net positive
      case 'net-negative':
        return '#dc2626' // Darker red for net negative
      default:
        return '#6b7280'
    }
  }

  const yDomain = useMemo(() => {
    if (waterfallData.length === 0) return [0, 0]
    let lo = Infinity
    let hi = -Infinity
    waterfallData.forEach((d) => {
      lo = Math.min(lo, d.min)
      hi = Math.max(hi, d.min + d.delta)
    })
    const range = hi - lo
    const padding = range > 0 ? range * 0.08 : Math.abs(lo) * 0.08 || 1
    return [lo - padding, hi + padding]
  }, [waterfallData])

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
        <ResponsiveContainer width="100%" height={360}>
          <BarChart
            data={waterfallData}
            margin={{ top: 44, right: 30, left: 20, bottom: 72 }}
            barCategoryGap="20%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={100}
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
              domain={yDomain}
              tickFormatter={formatCurrency}
              tick={{ fontSize: 12 }}
              stroke="#6b7280"
            />
            <Tooltip
              formatter={(value: number, name: string, props: any) => {
                const payload = props?.payload
                if (!payload || name === 'min') return null
                const raw = payload.value as number
                const sign = raw >= 0 ? '+' : ''
                return [`${sign}${formatCurrencyFull(raw)}`, payload.name]
              }}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: '8px 12px',
              }}
            />
            {/* Series A: transparent spacer (pedestal) so visible bar starts at running total */}
            <Bar dataKey="min" stackId="waterfall" fill="transparent" stroke="none" />
            {/* Series B: visible delta bar, colored by increase/decrease */}
            <Bar dataKey="delta" stackId="waterfall" radius={[4, 4, 0, 0]} stroke="#fff" strokeWidth={1} minPointSize={2}>
              {waterfallData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.type)} />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                offset={12}
                content={(props: any) => {
                  const x = Number(props.x) ?? 0
                  const y = Number(props.y) ?? 0
                  const width = Number(props.width) ?? 0
                  const height = Number(props.height) ?? 0
                  const payload = props.payload
                  const value = payload?.value
                  if (value == null || value === undefined) return null
                  const sign = value >= 0 ? '+' : ''
                  const text = `${sign}${formatCurrencyFull(value)}`
                  const isNetChange = payload?.name === 'Net Change'
                  const isNegative = value < 0
                  const labelY = isNegative ? y + height + 14 : y - 14
                  return (
                    <g transform={`translate(${x + width / 2},${labelY})`}>
                      <text
                        textAnchor="middle"
                        dy={0}
                        fill="#374151"
                        fontSize={11}
                        style={{ fontWeight: isNetChange ? 700 : 400 }}
                      >
                        {text}
                      </text>
                    </g>
                  )
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
