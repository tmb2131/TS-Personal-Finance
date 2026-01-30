'use client'

import { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCurrency } from '@/lib/contexts/currency-context'
import { createClient } from '@/lib/supabase/client'
import { MonthlyTrend } from '@/lib/types'
import { endOfMonth, type RatesByMonthOffset } from '@/lib/utils/fx-rates'
import { cn } from '@/utils/cn'
import { AlertCircle, TrendingUp, TrendingDown, ArrowUpDown, ArrowUp, ArrowDown, Calendar } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

type SortField = 'category' | 'cur_month_minus_3' | 'cur_month_minus_2' | 'cur_month_minus_1' | 'cur_month_est' | 'ttm_avg' | 'z_score' | 'delta_last_month' | 'delta_l3m' | 'delta_l12m'
type SortDirection = 'asc' | 'desc' | null

interface MonthlyTrendsTableProps {
  initialData?: MonthlyTrend[]
  initialRatesByMonth?: RatesByMonthOffset
}

export function MonthlyTrendsTable({ initialData, initialRatesByMonth }: MonthlyTrendsTableProps = {}) {
  const { currency, fxRate: contextFxRate } = useCurrency()
  const [data, setData] = useState<MonthlyTrend[]>(initialData || [])
  const [ratesByMonth, setRatesByMonth] = useState<RatesByMonthOffset | null>(initialRatesByMonth ?? null)
  const [currentFxRate, setCurrentFxRate] = useState<number>(contextFxRate)
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('delta_last_month')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  useEffect(() => {
    if (initialData) {
      setData(initialData)
      setLoading(false)
      if (initialRatesByMonth) setRatesByMonth(initialRatesByMonth)
      return
    }

    async function fetchData() {
      setLoading(true)
      const supabase = createClient()
      const now = new Date()
      let y = now.getFullYear()
      let m = now.getMonth() + 1
      const monthAgo = (monthsBack: number) => {
        let mm = m - monthsBack
        let yy = y
        while (mm <= 0) {
          mm += 12
          yy -= 1
        }
        return endOfMonth(yy, mm)
      }
      const eom3 = monthAgo(3)
      const eom2 = monthAgo(2)
      const eom1 = monthAgo(1)
      const eom0 = endOfMonth(y, m)

      const [trendsRes, fxRes] = await Promise.all([
        supabase.from('monthly_trends').select('*').order('category'),
        supabase
          .from('fx_rates')
          .select('date, gbpusd_rate')
          .gte('date', eom3)
          .lte('date', eom0)
          .order('date', { ascending: true }),
      ])

      if (trendsRes.error) {
        console.error('Error fetching monthly trends:', trendsRes.error)
        setError('Failed to load monthly trends data. Please try refreshing the page.')
        setLoading(false)
        return
      }
      setError(null)
      setData(trendsRes.data as MonthlyTrend[])

      const rows = (fxRes.data || []) as { date: string; gbpusd_rate: number | null }[]
      const dateToRate = new Map<string, number>()
      rows.forEach((r) => {
        const d = (r.date || '').split('T')[0]
        if (r.gbpusd_rate != null && r.gbpusd_rate > 0) dateToRate.set(d, r.gbpusd_rate)
      })
      const sortedDates = Array.from(dateToRate.keys()).sort()
      const getRate = (dateStr: string) => {
        const prior = sortedDates.filter((d) => d <= dateStr).pop()
        return prior != null ? dateToRate.get(prior)! : contextFxRate
      }
      setCurrentFxRate(contextFxRate)
      setRatesByMonth({
        current: sortedDates.length ? getRate(eom0) : contextFxRate,
        minus1: sortedDates.length ? getRate(eom1) : contextFxRate,
        minus2: sortedDates.length ? getRate(eom2) : contextFxRate,
        minus3: sortedDates.length ? getRate(eom3) : contextFxRate,
      })
      setLoading(false)
    }

    fetchData()
  }, [initialData, initialRatesByMonth, contextFxRate])

  // When we have initialRatesByMonth, use it for current rate fallback
  useEffect(() => {
    if (initialRatesByMonth) {
      setCurrentFxRate(initialRatesByMonth.current)
    }
  }, [initialRatesByMonth])

  // When USD selected but no EoM rates (e.g. table used without wrapper), use context FX rate
  useEffect(() => {
    if (currency === 'USD' && ratesByMonth == null) {
      setCurrentFxRate(contextFxRate)
    }
  }, [currency, ratesByMonth, contextFxRate])

  // Format currency as £0.0K
  const formatCurrency = (value: number) => {
    const valueInK = value / 1000
    const currencySymbol = currency === 'USD' ? '$' : '£'
    return `${currencySymbol}${valueInK.toFixed(1)}K`
  }

  // Format currency with parentheses for negative values
  const formatCurrencyWithParens = (value: number) => {
    if (value === 0) return '-'
    const absValue = Math.abs(value)
    const valueInK = absValue / 1000
    const currencySymbol = currency === 'USD' ? '$' : '£'
    return `(${currencySymbol}${valueInK.toFixed(1)}K)`
  }

  // Format currency for large values (M for millions, K for thousands)
  const formatCurrencyLarge = (value: number) => {
    const valueInM = Math.abs(value) / 1000000
    const currencySymbol = currency === 'USD' ? '$' : '£'
    if (valueInM >= 1) {
      return `${currencySymbol}${valueInM.toFixed(1)}M`
    }
    return formatCurrency(value)
  }

  // Format percentage with sign
  const formatPercent = (value: number) => {
    const absValue = Math.abs(value)
    if (absValue < 0.1) {
      return '<0.1%'
    }
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
  }

  // Format percentage without sign
  const formatPercentAbs = (value: number) => {
    const absValue = Math.abs(value)
    if (absValue < 0.1) {
      return '<0.1%'
    }
    return `${absValue.toFixed(1)}%`
  }

  // Data in monthly_trends is stored in GBP. When GBP selected show as-is; when USD selected convert GBP → USD (multiply by rate).
  const processedData = useMemo(() => {
    const r = currency === 'USD' ? ratesByMonth : null
    const fallbackRate = currency === 'USD' ? currentFxRate : 1
    const mult = (row: MonthlyTrend, key: keyof Pick<MonthlyTrend, 'cur_month_minus_3' | 'cur_month_minus_2' | 'cur_month_minus_1' | 'cur_month_est' | 'ttm_avg'>) => {
      const gbpValue = row[key] as number
      if (currency === 'GBP') return gbpValue
      // USD: convert GBP → USD using EoM rates when available, else current rate
      if (r) {
        switch (key) {
          case 'cur_month_minus_3': return gbpValue * r.minus3
          case 'cur_month_minus_2': return gbpValue * r.minus2
          case 'cur_month_minus_1': return gbpValue * r.minus1
          case 'cur_month_est': return gbpValue * r.current
          case 'ttm_avg': return gbpValue * r.minus1
          default: return gbpValue * fallbackRate
        }
      }
      return gbpValue * fallbackRate
    }
    return data.map((row) => {
      const c3 = mult(row, 'cur_month_minus_3')
      const c2 = mult(row, 'cur_month_minus_2')
      const c1 = mult(row, 'cur_month_minus_1')
      const c0 = mult(row, 'cur_month_est')
      const ttm = mult(row, 'ttm_avg')
      const l3m_avg = (c3 + c2 + c1) / 3
      return {
        ...row,
        cur_month_minus_3: c3,
        cur_month_minus_2: c2,
        cur_month_minus_1: c1,
        cur_month_est: c0,
        ttm_avg: ttm,
        delta_vs_last_month: c0 - c1,
        delta_vs_l12m_avg: c0 - ttm,
        delta_vs_l3m: c0 - l3m_avg,
      }
    })
  }, [data, currency, ratesByMonth, currentFxRate])

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortDirection) return processedData

    return [...processedData].sort((a, b) => {
      let aValue: number | string
      let bValue: number | string

      // Handle different sort fields
      if (sortField === 'category') {
        aValue = a.category.toLowerCase()
        bValue = b.category.toLowerCase()
      } else if (sortField === 'delta_last_month') {
        aValue = a.delta_vs_last_month
        bValue = b.delta_vs_last_month
      } else if (sortField === 'delta_l3m') {
        aValue = a.delta_vs_l3m
        bValue = b.delta_vs_l3m
      } else if (sortField === 'delta_l12m') {
        aValue = a.delta_vs_l12m_avg
        bValue = b.delta_vs_l12m_avg
      } else {
        aValue = a[sortField]
        bValue = b[sortField]
      }

      // Handle string comparison for category
      if (sortField === 'category') {
        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
        return 0
      }

      // Handle numeric comparison
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [processedData, sortField, sortDirection])

  // Calculate totals
  const totals = useMemo(() => {
    const sums = sortedData.reduce(
      (acc, row) => ({
        cur_month_minus_3: acc.cur_month_minus_3 + Math.abs(row.cur_month_minus_3),
        cur_month_minus_2: acc.cur_month_minus_2 + Math.abs(row.cur_month_minus_2),
        cur_month_minus_1: acc.cur_month_minus_1 + Math.abs(row.cur_month_minus_1),
        cur_month_est: acc.cur_month_est + Math.abs(row.cur_month_est),
        ttm_avg: acc.ttm_avg + Math.abs(row.ttm_avg),
        delta_vs_last_month: acc.delta_vs_last_month + row.delta_vs_last_month,
        delta_vs_l3m: acc.delta_vs_l3m + row.delta_vs_l3m,
        delta_vs_l12m_avg: acc.delta_vs_l12m_avg + row.delta_vs_l12m_avg,
      }),
      {
        cur_month_minus_3: 0,
        cur_month_minus_2: 0,
        cur_month_minus_1: 0,
        cur_month_est: 0,
        ttm_avg: 0,
        delta_vs_last_month: 0,
        delta_vs_l3m: 0,
        delta_vs_l12m_avg: 0,
      }
    )
    const l3m_avg = (sums.cur_month_minus_3 + sums.cur_month_minus_2 + sums.cur_month_minus_1) / 3
    return { ...sums, l3m_avg }
  }, [sortedData])

  // Calculate top movers based on selected sort
  // If sorting by a non-delta column, default to delta_l3m for cards
  const topMovers = useMemo(() => {
    let changes: Array<{ category: string; change: number }>
    let totalVariance: number
    
    // Determine which delta to use for cards
    const deltaForCards = 
      sortField === 'delta_last_month' ? 'delta_last_month' :
      sortField === 'delta_l3m' ? 'delta_l3m' :
      sortField === 'delta_l12m' ? 'delta_l12m' :
      'delta_l3m' // Default to delta_l3m for non-delta columns
    
    if (deltaForCards === 'delta_last_month') {
      changes = processedData.map((row) => ({
        category: row.category,
        change: row.delta_vs_last_month,
      }))
      totalVariance = totals.delta_vs_last_month
    } else if (deltaForCards === 'delta_l3m') {
      changes = processedData.map((row) => ({
        category: row.category,
        change: row.delta_vs_l3m,
      }))
      totalVariance = totals.delta_vs_l3m
    } else {
      changes = processedData.map((row) => ({
        category: row.category,
        change: row.delta_vs_l12m_avg,
      }))
      totalVariance = totals.delta_vs_l12m_avg
    }

    // Top increases in spend (biggest negative deltas = spending more)
    // Since expenses are negative, a negative delta means spending increased
    const topIncreases = [...changes]
      .filter((c) => c.change < 0) // Negative delta = spending increased
      .sort((a, b) => a.change - b.change) // Most negative first (biggest increase in spend)
      .slice(0, 3)

    // Top decreases in spend (biggest positive deltas = spending less)
    // Since expenses are negative, a positive delta means spending decreased
    const topDecreases = [...changes]
      .filter((c) => c.change > 0) // Positive delta = spending decreased
      .sort((a, b) => b.change - a.change) // Most positive first (biggest decrease in spend)
      .slice(0, 3)

    // Calculate percentage change based on comparison value
    let comparisonValue: number
    if (deltaForCards === 'delta_last_month') {
      comparisonValue = totals.cur_month_minus_1
    } else if (deltaForCards === 'delta_l3m') {
      comparisonValue = totals.l3m_avg
    } else {
      comparisonValue = totals.ttm_avg
    }
    
    const totalVariancePercent = comparisonValue !== 0 
      ? ((totalVariance / Math.abs(comparisonValue)) * 100)
      : 0

    return {
      topIncreases,
      topDecreases,
      totalVariance,
      totalVariancePercent,
      deltaForCards,
      comparisonValue,
    }
  }, [processedData, sortField, totals])

  // Get max values for color scaling
  const maxValues = useMemo(() => {
    const allValues = sortedData.flatMap((row) => [
      Math.abs(row.cur_month_minus_3),
      Math.abs(row.cur_month_minus_2),
      Math.abs(row.cur_month_minus_1),
      Math.abs(row.cur_month_est),
      Math.abs(row.ttm_avg),
    ])
    return {
      monthly: Math.max(...allValues, 1),
      deltaVsLastMonth: Math.max(...sortedData.map((row) => Math.abs(row.delta_vs_last_month)), 1),
      delta: Math.max(
        ...sortedData.map((row) => Math.max(Math.abs(row.delta_vs_l3m), Math.abs(row.delta_vs_l12m_avg))),
        1
      ),
    }
  }, [sortedData])

  // Get background color intensity for monthly values
  const getMonthlyBgColor = (value: number) => {
    if (value === 0) return 'bg-white'
    const intensity = Math.min(Math.abs(value) / maxValues.monthly, 1)
    const opacity = 0.1 + intensity * 0.4 // Range from 0.1 to 0.5
    return `bg-red-100`
  }

  // Get background color intensity for monthly values - reduced opacity for readability
  const getMonthlyBgStyle = (value: number) => {
    if (value === 0) return {}
    const intensity = Math.min(Math.abs(value) / maxValues.monthly, 1)
    const opacity = 0.05 + intensity * 0.1 // Range from 0.05 to 0.15 (much more subtle)
    return {
      backgroundColor: `rgba(239, 68, 68, ${opacity})`, // red-500 with low opacity
    }
  }

  // Sparkline component for monthly trends
  const Sparkline = ({ row }: { row: typeof processedData[0] }) => {
    const sparklineData = [
      { month: getMonthName(3), value: Math.abs(row.cur_month_minus_3) },
      { month: getMonthName(2), value: Math.abs(row.cur_month_minus_2) },
      { month: getMonthName(1), value: Math.abs(row.cur_month_minus_1) },
      { month: getMonthName(0), value: Math.abs(row.cur_month_est) },
    ]

    // Determine color based on delta vs L3M avg (consistent with delta column)
    // Positive delta (>= 0) = spending decreased = green
    // Negative delta (< 0) = spending increased = red
    const deltaVsL3m = row.delta_vs_l3m
    const lineColor = deltaVsL3m >= 0 ? '#22c55e' : '#ef4444' // green-500 or red-500

    // Calculate min/max for scaling
    const values = sparklineData.map((d) => d.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1 // Avoid division by zero

    // Normalize values to 0-100 for display
    const normalizedData = sparklineData.map((d) => ({
      ...d,
      normalized: ((d.value - min) / range) * 100,
    }))

    // Tooltip text: start and end values
    const startValue = formatCurrencyWithParens(-sparklineData[0].value)
    const endValue = formatCurrencyWithParens(-sparklineData[sparklineData.length - 1].value)
    const tooltipText = `${sparklineData[0].month}: ${startValue} → ${sparklineData[sparklineData.length - 1].month}: ${endValue}`

    return (
      <div 
        className="w-20 h-8 flex items-center justify-center"
        title={tooltipText}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={normalizedData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <Line
              type="monotone"
              dataKey="normalized"
              stroke={lineColor}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    )
  }

  // Delta component (reusable for all delta columns)
  const DeltaCell = ({ 
    value, 
    maxValue 
  }: { 
    value: number
    maxValue: number
  }) => {
    return (
      <div className="flex items-center justify-end gap-2">
        <span
          className={cn(
            'font-medium',
            value >= 0 ? 'text-green-600' : 'text-red-600'
          )}
        >
          {value === 0 
            ? '-' 
            : value > 0 
              ? formatCurrency(value)
              : formatCurrencyWithParens(-value)}
        </span>
        {value !== 0 && (
          <div className="relative h-4 w-16">
            <div
              className={cn(
                'absolute h-full',
                value >= 0 ? 'bg-green-500 right-0' : 'bg-red-500 left-0'
              )}
              style={{
                width: `${Math.min((Math.abs(value) / maxValue) * 100, 100)}%`,
              }}
            />
          </div>
        )}
      </div>
    )
  }

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  // Sort icon component
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
    }
    if (sortDirection === 'asc') {
      return <ArrowUp className="ml-2 h-4 w-4" />
    }
    return <ArrowDown className="ml-2 h-4 w-4" />
  }

  // Get comparison text for cards
  const getComparisonText = (deltaForCards: string) => {
    if (deltaForCards === 'delta_last_month') {
      return `Compared to ${getMonthName(1)}`
    } else if (deltaForCards === 'delta_l3m') {
      return 'Compared to Last 3M Avg'
    } else {
      return 'Compared to L12M Avg'
    }
  }

  // Period label for "£X more/less than [period]" in Total Variance card
  const getComparisonPeriodLabel = (deltaForCards: string) => {
    if (deltaForCards === 'delta_last_month') return getMonthName(1)
    if (deltaForCards === 'delta_l3m') return 'last 3M avg'
    return 'L12M avg'
  }

  // Get month names (assuming current month is January 2026)
  const getMonthName = (offset: number) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    // Assuming we're in Jan 2026, so:
    // offset 0 = Jan '26, offset 1 = Dec '25, offset 2 = Nov '25, offset 3 = Oct '25
    const currentDate = new Date()
    const currentMonth = currentDate.getMonth() // 0-based (0 = January)
    const currentYear = currentDate.getFullYear()
    
    let monthIndex = currentMonth - offset
    let year = currentYear
    
    while (monthIndex < 0) {
      monthIndex += 12
      year--
    }
    
    const shortYear = year.toString().slice(-2)
    return `${months[monthIndex]} '${shortYear}`
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="pt-6">
          {/* Key Insights Cards Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border-2">
                <CardHeader className="pb-3">
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><Skeleton className="h-4 w-24" /></TableHead>
                <TableHead><Skeleton className="h-4 w-20" /></TableHead>
                <TableHead><Skeleton className="h-4 w-20" /></TableHead>
                <TableHead><Skeleton className="h-4 w-20" /></TableHead>
                <TableHead><Skeleton className="h-4 w-24" /></TableHead>
                <TableHead><Skeleton className="h-4 w-20" /></TableHead>
                <TableHead><Skeleton className="h-4 w-20" /></TableHead>
                <TableHead><Skeleton className="h-4 w-16" /></TableHead>
                <TableHead><Skeleton className="h-4 w-20" /></TableHead>
                <TableHead><Skeleton className="h-4 w-20" /></TableHead>
                <TableHead><Skeleton className="h-4 w-20" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <CardTitle>Monthly Trends</CardTitle>
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

  return (
    <Card>
      <CardHeader className="bg-muted/50">
        <CardTitle>Monthly Trends</CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        {/* Key Insights Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Total Variance */}
          <div className="space-y-3 p-4 rounded-lg border-2 border-gray-700 bg-card">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-indigo-600" />
              <h3 className="font-semibold text-sm uppercase tracking-wide">Total Variance</h3>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{getComparisonText(topMovers.deltaForCards)}</p>
                {topMovers.totalVariance < 0 ? (
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-red-600" />
                    <p className="text-lg font-bold text-red-600">Spending More</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-green-600" />
                    <p className="text-lg font-bold text-green-600">Spending Less</p>
                  </div>
                )}
              </div>
              <div className="space-y-1 pt-2 border-t">
                <p className="text-sm">
                  <span className={cn('font-semibold', topMovers.totalVariance < 0 ? 'text-red-600' : 'text-green-600')}>
                    {formatCurrency(Math.abs(topMovers.totalVariance))}
                  </span>
                  <span className="text-xs text-muted-foreground ml-1">
                    {topMovers.totalVariance < 0 ? 'more' : 'less'} than {getComparisonPeriodLabel(topMovers.deltaForCards)}
                  </span>
                </p>
                <p className="text-xs">
                  <span className={`font-medium ${topMovers.totalVariance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatPercentAbs(topMovers.totalVariancePercent)}
                  </span>
                  <span className="text-muted-foreground ml-1">
                    {topMovers.totalVariance < 0 ? 'more' : 'less'} than {getComparisonPeriodLabel(topMovers.deltaForCards)}
                  </span>
                </p>
                <div className="pt-1 mt-1 border-t">
                  <p className="text-xs text-muted-foreground">
                    {getMonthName(0)} Est: <span className="font-medium">{formatCurrencyLarge(Math.abs(totals.cur_month_est))}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {topMovers.deltaForCards === 'delta_last_month' 
                      ? `${getMonthName(1)}: `
                      : topMovers.deltaForCards === 'delta_l3m'
                        ? 'Last 3M Avg: '
                        : 'TTM Avg: '}
                    <span className="font-medium">
                      {formatCurrencyLarge(Math.abs(topMovers.comparisonValue))}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* MoM Increases in Spend */}
          <div className="space-y-3 p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-red-600" />
              <h3 className="font-semibold text-sm uppercase tracking-wide">MoM Increases in Spend</h3>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{getComparisonText(topMovers.deltaForCards)}</p>
                {topMovers.topIncreases.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-red-600" />
                    <p className="text-lg font-bold text-red-600">Top Categories Spending More</p>
                  </div>
                ) : (
                  <p className="text-lg font-bold text-muted-foreground">No Increases</p>
                )}
              </div>
              <div className="space-y-3 pt-2 border-t">
                {topMovers.topIncreases.length > 0 ? (
                  topMovers.topIncreases.map((item) => {
                    const maxVal = Math.max(...topMovers.topIncreases.map((i) => Math.abs(i.change)), 1)
                    const pct = (Math.abs(item.change) / maxVal) * 100
                    return (
                      <div key={item.category} className="flex items-center gap-2">
                        <span className="text-sm w-24 truncate">{item.category}</span>
                        <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                          <div className="h-full bg-red-500 rounded" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-medium text-red-600 w-14 text-right">{formatCurrency(Math.abs(item.change))}</span>
                      </div>
                    )
                  })
                ) : (
                  <p className="text-xs text-muted-foreground">No categories with increased spending</p>
                )}
              </div>
            </div>
          </div>

          {/* MoM Decreases in Spend */}
          <div className="space-y-3 p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-green-600" />
              <h3 className="font-semibold text-sm uppercase tracking-wide">MoM Decreases in Spend</h3>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{getComparisonText(topMovers.deltaForCards)}</p>
                {topMovers.topDecreases.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-green-600" />
                    <p className="text-lg font-bold text-green-600">Top Categories Spending Less</p>
                  </div>
                ) : (
                  <p className="text-lg font-bold text-muted-foreground">No Decreases</p>
                )}
              </div>
              <div className="space-y-3 pt-2 border-t">
                {topMovers.topDecreases.length > 0 ? (
                  topMovers.topDecreases.map((item) => {
                    const maxVal = Math.max(...topMovers.topDecreases.map((i) => Math.abs(i.change)), 1)
                    const pct = (Math.abs(item.change) / maxVal) * 100
                    return (
                      <div key={item.category} className="flex items-center gap-2">
                        <span className="text-sm w-24 truncate">{item.category}</span>
                        <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                          <div className="h-full bg-green-500 rounded" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-medium text-green-600 w-14 text-right">{formatCurrency(Math.abs(item.change))}</span>
                      </div>
                    )
                  })
                ) : (
                  <p className="text-xs text-muted-foreground">No categories with decreased spending</p>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Table with sticky header and total row */}
        <div className="hidden md:block relative max-h-[600px] overflow-auto border rounded-md">
            <table className="w-full caption-bottom text-sm">
            <TableHeader>
              <TableRow className="border-b">
              <TableHead className="sticky top-0 z-20 bg-muted">
                <button
                  onClick={() => handleSort('category')}
                  className="flex items-center hover:opacity-70 transition-opacity"
                >
                  Expense Categories
                  <SortIcon field="category" />
                </button>
              </TableHead>
              <TableHead className="sticky top-0 z-20 text-right bg-muted">
                <button
                  onClick={() => handleSort('cur_month_minus_3')}
                  className="flex items-center justify-end ml-auto hover:opacity-70 transition-opacity"
                >
                  {getMonthName(3)}
                  <SortIcon field="cur_month_minus_3" />
                </button>
              </TableHead>
              <TableHead className="sticky top-0 z-20 text-right bg-muted">
                <button
                  onClick={() => handleSort('cur_month_minus_2')}
                  className="flex items-center justify-end ml-auto hover:opacity-70 transition-opacity"
                >
                  {getMonthName(2)}
                  <SortIcon field="cur_month_minus_2" />
                </button>
              </TableHead>
              <TableHead className="sticky top-0 z-20 text-right bg-muted">
                <button
                  onClick={() => handleSort('cur_month_minus_1')}
                  className="flex items-center justify-end ml-auto hover:opacity-70 transition-opacity"
                >
                  {getMonthName(1)}
                  <SortIcon field="cur_month_minus_1" />
                </button>
              </TableHead>
              <TableHead className="sticky top-0 z-20 text-right border-l-2 border-r-2 border-gray-700 bg-muted">
                <button
                  onClick={() => handleSort('cur_month_est')}
                  className="flex items-center justify-end ml-auto hover:opacity-70 transition-opacity"
                >
                  {getMonthName(0)} Est.
                  <SortIcon field="cur_month_est" />
                </button>
              </TableHead>
              <TableHead className="sticky top-0 z-20 text-right w-24 bg-muted">Trend</TableHead>
              <TableHead className="sticky top-0 z-20 text-right bg-muted">
                <button
                  onClick={() => handleSort('ttm_avg')}
                  className="flex items-center justify-end ml-auto hover:opacity-70 transition-opacity"
                >
                  TTM Avg
                  <SortIcon field="ttm_avg" />
                </button>
              </TableHead>
              <TableHead className="sticky top-0 z-20 text-right bg-muted">
                <button
                  onClick={() => handleSort('z_score')}
                  className="flex items-center justify-end ml-auto hover:opacity-70 transition-opacity"
                >
                  Z-Score
                  <SortIcon field="z_score" />
                </button>
              </TableHead>
              <TableHead className="sticky top-0 z-20 text-right bg-muted">
                <button
                  onClick={() => handleSort('delta_last_month')}
                  className="flex items-center justify-end ml-auto hover:opacity-70 transition-opacity"
                >
                  Delta vs Last Mo
                  <SortIcon field="delta_last_month" />
                </button>
              </TableHead>
              <TableHead className="sticky top-0 z-20 text-right bg-muted">
                <button
                  onClick={() => handleSort('delta_l3m')}
                  className="flex items-center justify-end ml-auto hover:opacity-70 transition-opacity"
                >
                  Delta vs. L3M Avg
                  <SortIcon field="delta_l3m" />
                </button>
              </TableHead>
              <TableHead className="sticky top-0 z-20 text-right bg-muted">
                <button
                  onClick={() => handleSort('delta_l12m')}
                  className="flex items-center justify-end ml-auto hover:opacity-70 transition-opacity"
                >
                  Delta vs. L12M Avg
                  <SortIcon field="delta_l12m" />
                </button>
              </TableHead>
            </TableRow>
            {/* Total Row */}
            <TableRow className="bg-muted/50 border-b-2 border-gray-700">
              <TableCell className="font-semibold bg-muted/50">Total</TableCell>
              <TableCell className="text-right font-semibold bg-muted/50" style={getMonthlyBgStyle(totals.cur_month_minus_3)}>
                {formatCurrencyWithParens(-totals.cur_month_minus_3)}
              </TableCell>
              <TableCell className="text-right font-semibold bg-muted/50" style={getMonthlyBgStyle(totals.cur_month_minus_2)}>
                {formatCurrencyWithParens(-totals.cur_month_minus_2)}
              </TableCell>
              <TableCell className="text-right font-semibold bg-muted/50" style={getMonthlyBgStyle(totals.cur_month_minus_1)}>
                {formatCurrencyWithParens(-totals.cur_month_minus_1)}
              </TableCell>
              <TableCell className="text-right font-semibold border-l-2 border-r-2 border-gray-700 bg-muted/50" style={getMonthlyBgStyle(totals.cur_month_est)}>
                {formatCurrencyWithParens(-totals.cur_month_est)}
              </TableCell>
              <TableCell className="text-right bg-muted/50">
                {/* Sparkline for total */}
                <Sparkline row={{
                  category: 'Total',
                  cur_month_minus_3: totals.cur_month_minus_3,
                  cur_month_minus_2: totals.cur_month_minus_2,
                  cur_month_minus_1: totals.cur_month_minus_1,
                  cur_month_est: totals.cur_month_est,
                  ttm_avg: totals.ttm_avg,
                  z_score: 0,
                  delta_vs_l3m: totals.delta_vs_l3m,
                  delta_vs_last_month: totals.delta_vs_last_month,
                  delta_vs_l12m_avg: totals.delta_vs_l12m_avg,
                } as typeof processedData[0]} />
              </TableCell>
              <TableCell className="text-right font-semibold bg-muted/50" style={getMonthlyBgStyle(totals.ttm_avg)}>
                {formatCurrencyWithParens(-totals.ttm_avg)}
              </TableCell>
              <TableCell className="bg-muted/50"></TableCell>
              <TableCell className="text-right font-semibold bg-muted/50">
                <DeltaCell value={totals.delta_vs_last_month} maxValue={maxValues.deltaVsLastMonth} />
              </TableCell>
              <TableCell className="text-right font-semibold bg-muted/50">
                <DeltaCell value={totals.delta_vs_l3m} maxValue={maxValues.delta} />
              </TableCell>
              <TableCell className="text-right font-semibold bg-muted/50">
                <DeltaCell value={totals.delta_vs_l12m_avg} maxValue={maxValues.delta} />
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((row) => {
              return (
                <TableRow key={row.category}>
                  <TableCell className="font-medium">
                    {row.category}
                  </TableCell>
                  
                  {/* Monthly columns with color-coded backgrounds */}
                  <TableCell className="text-right" style={getMonthlyBgStyle(row.cur_month_minus_3)}>
                    {row.cur_month_minus_3 === 0 ? '-' : formatCurrencyWithParens(-row.cur_month_minus_3)}
                  </TableCell>
                  <TableCell className="text-right" style={getMonthlyBgStyle(row.cur_month_minus_2)}>
                    {row.cur_month_minus_2 === 0 ? '-' : formatCurrencyWithParens(-row.cur_month_minus_2)}
                  </TableCell>
                  <TableCell className="text-right" style={getMonthlyBgStyle(row.cur_month_minus_1)}>
                    {row.cur_month_minus_1 === 0 ? '-' : formatCurrencyWithParens(-row.cur_month_minus_1)}
                  </TableCell>
                  <TableCell className="text-right border-l-2 border-r-2 border-gray-700" style={getMonthlyBgStyle(row.cur_month_est)}>
                    {row.cur_month_est === 0 ? '-' : formatCurrencyWithParens(-row.cur_month_est)}
                  </TableCell>
                  
                  {/* Sparkline Trend */}
                  <TableCell className="text-right">
                    <Sparkline row={row} />
                  </TableCell>
                  
                  <TableCell className="text-right" style={getMonthlyBgStyle(row.ttm_avg)}>
                    {row.ttm_avg === 0 ? '-' : formatCurrencyWithParens(-row.ttm_avg)}
                  </TableCell>
                  
                  {/* Z-Score with mini bar chart */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-medium min-w-[3rem] text-right">{row.z_score.toFixed(1)}</span>
                      <div className="relative h-4 w-20 border border-gray-300 rounded bg-white">
                        {/* Zero line (center) */}
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-400 border-dashed -translate-x-1/2"></div>
                        {/* Bar representation - purple bars for negative, green for positive */}
                        {row.z_score !== 0 && (
                          <div
                            className={cn(
                              'absolute h-2 top-1 rounded-sm',
                              row.z_score >= 0 ? 'bg-green-500' : 'bg-purple-500'
                            )}
                            style={{
                              left: row.z_score >= 0 ? '50%' : `${Math.max(2, 50 - Math.min(Math.abs(row.z_score) * 8, 48))}%`,
                              width: `${Math.min(Math.abs(row.z_score) * 8, 48)}%`,
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </TableCell>
                  
                  {/* Delta vs Last Month */}
                  <TableCell className="text-right">
                    <DeltaCell value={row.delta_vs_last_month} maxValue={maxValues.deltaVsLastMonth} />
                  </TableCell>
                  
                  {/* Delta vs L3M */}
                  <TableCell className="text-right">
                    <DeltaCell value={row.delta_vs_l3m} maxValue={maxValues.delta} />
                  </TableCell>
                  
                  {/* Delta vs L12M Avg */}
                  <TableCell className="text-right">
                    <DeltaCell value={row.delta_vs_l12m_avg} maxValue={maxValues.delta} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
            </table>
        </div>
      </CardContent>
    </Card>
  )
}
