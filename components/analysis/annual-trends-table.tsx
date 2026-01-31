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
import { AnnualTrend } from '@/lib/types'
import { endOfYear, type RatesByYear } from '@/lib/utils/fx-rates'
import { cn } from '@/utils/cn'
import { AlertCircle, ArrowUpDown, ArrowUp, ArrowDown, TrendingUp, TrendingDown, Calendar } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

type SortField = 'category' | 'cur_yr_minus_4' | 'cur_yr_minus_3' | 'cur_yr_minus_2' | 'cur_yr_minus_1' | 'cur_yr_est' | 'cur_yr_est_vs_last_yr' | 'cur_yr_est_vs_4yr_avg'
type SortDirection = 'asc' | 'desc' | null

interface AnnualTrendsTableProps {
  initialData?: AnnualTrend[]
  initialFxRate?: number
  initialRatesByYear?: RatesByYear
}

export function AnnualTrendsTable({ initialData, initialFxRate, initialRatesByYear }: AnnualTrendsTableProps = {}) {
  const { currency, fxRate: contextFxRate } = useCurrency()
  const currentYear = new Date().getFullYear()
  const [data, setData] = useState<AnnualTrend[]>(initialData || [])
  const [fxRate, setFxRate] = useState<number>(initialFxRate ?? contextFxRate)
  const [ratesByYear, setRatesByYear] = useState<RatesByYear>(initialRatesByYear || {})
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('cur_yr_est_vs_4yr_avg')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  useEffect(() => {
    if (initialData) {
      setData(initialData)
      setLoading(false)
      if (initialFxRate) setFxRate(initialFxRate)
      if (initialRatesByYear) setRatesByYear(initialRatesByYear)
      return
    }

    async function fetchData() {
      setLoading(true)
      const supabase = createClient()
      const [trendsResult, fxRatesResult] = await Promise.all([
        supabase.from('annual_trends').select('*').order('category'),
        supabase
          .from('fx_rates')
          .select('date, gbpusd_rate')
          .gte('date', endOfYear(currentYear - 4))
          .lte('date', endOfYear(currentYear))
          .order('date', { ascending: true }),
      ])

      if (trendsResult.error) {
        console.error('Error fetching annual trends:', trendsResult.error)
        setError('Failed to load annual trends data. Please try refreshing the page.')
        setLoading(false)
        return
      }
      setError(null)

      const rows = (fxRatesResult.data || []) as { date: string; gbpusd_rate: number | null }[]
      const dateToRate = new Map<string, number>()
      rows.forEach((r) => {
        const d = (r.date || '').split('T')[0]
        if (r.gbpusd_rate != null && r.gbpusd_rate > 0) dateToRate.set(d, r.gbpusd_rate)
      })
      const sortedDates = Array.from(dateToRate.keys()).sort()
      const byYear: RatesByYear = {}
      for (let y = currentYear - 4; y <= currentYear; y++) {
        const eoy = endOfYear(y)
        const prior = sortedDates.filter((d) => d <= eoy).pop()
        byYear[y] = prior != null ? dateToRate.get(prior)! : 1.25
      }
      if (sortedDates.length === 0) {
        for (let y = currentYear - 4; y <= currentYear; y++) byYear[y] = contextFxRate
      }
      setRatesByYear(byYear)
      setData(trendsResult.data as AnnualTrend[])
      setLoading(false)
    }

    fetchData()
  }, [currency, initialData, initialFxRate, initialRatesByYear, currentYear, contextFxRate])

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

  // Data in annual_trends is stored in GBP. When GBP selected show as-is (×1); when USD selected convert GBP → USD (× EoY rate).
  const processedData = useMemo(() => {
    const r4 = currency === 'USD' ? (ratesByYear[currentYear - 4] ?? fxRate) : 1
    const r3 = currency === 'USD' ? (ratesByYear[currentYear - 3] ?? fxRate) : 1
    const r2 = currency === 'USD' ? (ratesByYear[currentYear - 2] ?? fxRate) : 1
    const r1 = currency === 'USD' ? (ratesByYear[currentYear - 1] ?? fxRate) : 1
    const r0 = currency === 'USD' ? (ratesByYear[currentYear] ?? fxRate) : 1
    const converted = data.map((row) => ({
      ...row,
      cur_yr_minus_4: row.cur_yr_minus_4 * r4,
      cur_yr_minus_3: row.cur_yr_minus_3 * r3,
      cur_yr_minus_2: row.cur_yr_minus_2 * r2,
      cur_yr_minus_1: row.cur_yr_minus_1 * r1,
      cur_yr_est: row.cur_yr_est * r0,
      cur_yr_est_vs_4yr_avg: row.cur_yr_est_vs_4yr_avg * r0,
    }))

    // Sort data
    if (!sortDirection) return converted

    const sorted = [...converted].sort((a, b) => {
      let aValue: number | string
      let bValue: number | string

      // Handle special case for Delta vs Last Year
      if (sortField === 'cur_yr_est_vs_last_yr') {
        aValue = a.cur_yr_est - a.cur_yr_minus_1
        bValue = b.cur_yr_est - b.cur_yr_minus_1
      } else {
        aValue = a[sortField]
        bValue = b[sortField]
      }

      // Handle string comparison for category
      if (sortField === 'category') {
        aValue = (aValue as string).toLowerCase()
        bValue = (bValue as string).toLowerCase()
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return sorted
  }, [data, ratesByYear, fxRate, currency, sortField, sortDirection, currentYear])

  // Calculate totals
  const totals = useMemo(() => {
    const totals = processedData.reduce(
      (acc, row) => ({
        cur_yr_minus_4: acc.cur_yr_minus_4 + Math.abs(row.cur_yr_minus_4),
        cur_yr_minus_3: acc.cur_yr_minus_3 + Math.abs(row.cur_yr_minus_3),
        cur_yr_minus_2: acc.cur_yr_minus_2 + Math.abs(row.cur_yr_minus_2),
        cur_yr_minus_1: acc.cur_yr_minus_1 + Math.abs(row.cur_yr_minus_1),
        cur_yr_est: acc.cur_yr_est + Math.abs(row.cur_yr_est),
        cur_yr_est_vs_4yr_avg: acc.cur_yr_est_vs_4yr_avg + row.cur_yr_est_vs_4yr_avg,
        // Sum individual deltas vs last year (same approach as vs 4yr avg)
        cur_yr_est_vs_last_yr: acc.cur_yr_est_vs_last_yr + (row.cur_yr_est - row.cur_yr_minus_1),
      }),
      {
        cur_yr_minus_4: 0,
        cur_yr_minus_3: 0,
        cur_yr_minus_2: 0,
        cur_yr_minus_1: 0,
        cur_yr_est: 0,
        cur_yr_est_vs_4yr_avg: 0,
        cur_yr_est_vs_last_yr: 0,
      }
    )
    return totals
  }, [processedData])

  // Get max values for color scaling
  const maxValues = useMemo(() => {
    const allValues = processedData.flatMap((row) => [
      Math.abs(row.cur_yr_minus_4),
      Math.abs(row.cur_yr_minus_3),
      Math.abs(row.cur_yr_minus_2),
      Math.abs(row.cur_yr_minus_1),
      Math.abs(row.cur_yr_est),
    ])
    const deltaVsLastYear = processedData.map((row) => Math.abs(row.cur_yr_est - row.cur_yr_minus_1))
    return {
      annual: Math.max(...allValues, 1),
      deltaVsLastYear: Math.max(...deltaVsLastYear, 1),
      delta: Math.max(...processedData.map((row) => Math.abs(row.cur_yr_est_vs_4yr_avg)), 1),
    }
  }, [processedData])

  // Get background color intensity for annual values - reduced opacity for readability
  const getAnnualBgStyle = (value: number) => {
    if (value === 0) return {}
    const intensity = Math.min(Math.abs(value) / maxValues.annual, 1)
    const opacity = 0.05 + intensity * 0.1 // Range from 0.05 to 0.15 (much more subtle)
    return {
      backgroundColor: `rgba(239, 68, 68, ${opacity})`, // red-500 with low opacity
    }
  }

  // Calculate top movers
  const topMovers = useMemo(() => {
    // Calculate current year vs last year change for each category
    const changes = processedData.map((row) => ({
      category: row.category,
      change: row.cur_yr_est - row.cur_yr_minus_1, // Current Year Est - Last Year
      cur_yr_est: row.cur_yr_est,
      cur_yr_minus_1: row.cur_yr_minus_1,
    }))

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

    // Total variance (sum of all current year Est - last year)
    const totalVariance = changes.reduce((sum, c) => sum + c.change, 0)
    
    // Calculate total spending for last year and current year estimate
    const totalLastYear = totals.cur_yr_minus_1
    const totalCurrentYear = totals.cur_yr_est
    const totalVariancePercent = totalLastYear !== 0 
      ? ((totalVariance / Math.abs(totalLastYear)) * 100)
      : 0

    return {
      topIncreases,
      topDecreases,
      totalVariance,
      totalVariancePercent,
      totalLastYear,
      totalCurrentYear,
    }
  }, [processedData, totals])

  // Sparkline component with tooltip
  const Sparkline = ({ row }: { row: typeof processedData[0] }) => {
    const sparklineData = [
      { year: currentYear - 4, value: Math.abs(row.cur_yr_minus_4) },
      { year: currentYear - 3, value: Math.abs(row.cur_yr_minus_3) },
      { year: currentYear - 2, value: Math.abs(row.cur_yr_minus_2) },
      { year: currentYear - 1, value: Math.abs(row.cur_yr_minus_1) },
      { year: currentYear, value: Math.abs(row.cur_yr_est) },
    ]

    // Determine color based on delta vs 4yr avg (consistent with delta column)
    // Positive delta (>= 0) = spending decreased = green
    // Negative delta (< 0) = spending increased = red
    const deltaVs4yrAvg = row.cur_yr_est_vs_4yr_avg
    const lineColor = deltaVs4yrAvg >= 0 ? '#22c55e' : '#ef4444' // green-500 or red-500

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
    const tooltipText = `${currentYear - 4}: ${startValue} → ${currentYear}: ${endValue}`

    return (
      <div 
        className="w-14 h-5 flex items-center justify-center"
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

  // Delta component (reusable for both Delta vs Last Yr and Delta vs 4yr Avg)
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
          <div className="relative h-2.5 w-10">
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
      setSortDirection('asc')
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

  if (loading) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><Skeleton className="h-4 w-24" /></TableHead>
                <TableHead><Skeleton className="h-4 w-16" /></TableHead>
                <TableHead><Skeleton className="h-4 w-16" /></TableHead>
                <TableHead><Skeleton className="h-4 w-16" /></TableHead>
                <TableHead><Skeleton className="h-4 w-16" /></TableHead>
                <TableHead><Skeleton className="h-4 w-24" /></TableHead>
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
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
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
          <CardTitle>Annual Trends</CardTitle>
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
      <CardHeader className="bg-muted/50 px-4 py-3 pb-4">
        <CardTitle className="text-base">Annual Trends</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        {/* Top Movers Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
          {/* Total Variance */}
          <div className="space-y-2 p-3 rounded-lg border-2 border-gray-700 bg-card">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-orange-600" />
              <h3 className="font-semibold text-xs uppercase tracking-wide">Total Variance</h3>
            </div>
            <div className="space-y-1">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">vs {currentYear - 1}</p>
                {topMovers.totalVariance < 0 ? (
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-red-600" />
                    <p className="text-base font-bold text-red-600">Spending More</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <TrendingDown className="h-4 w-4 text-green-600" />
                    <p className="text-base font-bold text-green-600">Spending Less</p>
                  </div>
                )}
              </div>
              <div className="space-y-0.5 pt-1.5 border-t">
                <p className="text-sm">
                  <span className={cn('font-semibold', topMovers.totalVariance < 0 ? 'text-red-600' : 'text-green-600')}>
                    {formatCurrency(Math.abs(topMovers.totalVariance))}
                  </span>
                  <span className="text-xs text-muted-foreground ml-1">
                    {topMovers.totalVariance < 0 ? 'more' : 'less'} than last year
                  </span>
                </p>
                <p className="text-xs">
                  <span className={`font-medium ${topMovers.totalVariance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatPercentAbs(topMovers.totalVariancePercent)}
                  </span>
                  <span className="text-muted-foreground ml-1">
                    {topMovers.totalVariance < 0 ? 'more' : 'less'} than last year
                  </span>
                </p>
                <div className="pt-0.5 mt-0.5 border-t">
                  <p className="text-xs text-muted-foreground">
                    {currentYear} Est: <span className="font-medium">{formatCurrencyLarge(Math.abs(totals.cur_yr_est))}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {currentYear - 1}: <span className="font-medium">{formatCurrencyLarge(Math.abs(totals.cur_yr_minus_1))}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* YoY Increases in Spend */}
          <div className="space-y-2 p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-red-600" />
              <h3 className="font-semibold text-xs uppercase tracking-wide">YoY Increases in Spend</h3>
            </div>
            <div className="space-y-1">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">vs {currentYear - 1}</p>
                {topMovers.topIncreases.length > 0 ? (
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-red-600" />
                    <p className="text-base font-bold text-red-600">Top Categories Spending More</p>
                  </div>
                ) : (
                  <p className="text-base font-bold text-muted-foreground">No Increases</p>
                )}
              </div>
              <div className="space-y-2 pt-1.5 border-t">
                {topMovers.topIncreases.length > 0 ? (
                  topMovers.topIncreases.map((item) => {
                    const maxVal = Math.max(...topMovers.topIncreases.map((i) => Math.abs(i.change)), 1)
                    const pct = (Math.abs(item.change) / maxVal) * 100
                    return (
                      <div key={item.category} className="flex items-center gap-1.5">
                        <span className="text-xs w-20 truncate">{item.category}</span>
                        <div className="flex-1 h-3 rounded bg-muted overflow-hidden">
                          <div className="h-full bg-red-500 rounded" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-medium text-red-600 w-12 text-right">{formatCurrency(Math.abs(item.change))}</span>
                      </div>
                    )
                  })
                ) : (
                  <p className="text-xs text-muted-foreground">No categories with increased spending</p>
                )}
              </div>
            </div>
          </div>

          {/* YoY Decreases in Spend */}
          <div className="space-y-2 p-3 rounded-lg border bg-card">
            <div className="flex items-center gap-1.5">
              <TrendingDown className="h-4 w-4 text-green-600" />
              <h3 className="font-semibold text-xs uppercase tracking-wide">YoY Decreases in Spend</h3>
            </div>
            <div className="space-y-1">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">vs {currentYear - 1}</p>
                {topMovers.topDecreases.length > 0 ? (
                  <div className="flex items-center gap-1.5">
                    <TrendingDown className="h-4 w-4 text-green-600" />
                    <p className="text-base font-bold text-green-600">Top Categories Spending Less</p>
                  </div>
                ) : (
                  <p className="text-base font-bold text-muted-foreground">No Decreases</p>
                )}
              </div>
              <div className="space-y-2 pt-1.5 border-t">
                {topMovers.topDecreases.length > 0 ? (
                  topMovers.topDecreases.map((item) => {
                    const maxVal = Math.max(...topMovers.topDecreases.map((i) => Math.abs(i.change)), 1)
                    const pct = (Math.abs(item.change) / maxVal) * 100
                    return (
                      <div key={item.category} className="flex items-center gap-1.5">
                        <span className="text-xs w-20 truncate">{item.category}</span>
                        <div className="flex-1 h-3 rounded bg-muted overflow-hidden">
                          <div className="h-full bg-green-500 rounded" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-medium text-green-600 w-12 text-right">{formatCurrency(Math.abs(item.change))}</span>
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

        <p className="md:hidden text-xs text-muted-foreground mt-2 mb-1">Full category table on larger screens.</p>

        {/* Table with sticky header and total row */}
        <div className="hidden md:block relative max-h-[75vh] overflow-auto border rounded-md [&_th]:h-5 [&_th]:px-1 [&_th]:py-0 [&_th]:text-[11px] [&_td]:h-5 [&_td]:px-1 [&_td]:py-0 [&_td]:text-[11px]">
            <table className="w-full caption-bottom text-sm">
            <TableHeader>
              <TableRow className="border-b bg-muted">
              <TableHead className={cn('sticky top-0 z-20 w-28 min-w-[7rem] bg-muted', sortField === 'category' && 'bg-gray-200 dark:bg-gray-700')}>
                <button
                  onClick={() => handleSort('category')}
                  className={cn('flex items-center hover:opacity-70 transition-opacity', sortField === 'category' && 'font-semibold')}
                >
                  Expense Categories
                  <SortIcon field="category" />
                </button>
              </TableHead>
              <TableHead className={cn('sticky top-0 z-20 text-right w-16 bg-muted', sortField === 'cur_yr_minus_4' && 'bg-gray-200 dark:bg-gray-700')}>
                <button
                  onClick={() => handleSort('cur_yr_minus_4')}
                  className={cn('flex items-center justify-end ml-auto hover:opacity-70 transition-opacity', sortField === 'cur_yr_minus_4' && 'font-semibold')}
                >
                  {currentYear - 4}
                  <SortIcon field="cur_yr_minus_4" />
                </button>
              </TableHead>
              <TableHead className={cn('sticky top-0 z-20 text-right w-16 bg-muted', sortField === 'cur_yr_minus_3' && 'bg-gray-200 dark:bg-gray-700')}>
                <button
                  onClick={() => handleSort('cur_yr_minus_3')}
                  className={cn('flex items-center justify-end ml-auto hover:opacity-70 transition-opacity', sortField === 'cur_yr_minus_3' && 'font-semibold')}
                >
                  {currentYear - 3}
                  <SortIcon field="cur_yr_minus_3" />
                </button>
              </TableHead>
              <TableHead className={cn('sticky top-0 z-20 text-right w-16 bg-muted', sortField === 'cur_yr_minus_2' && 'bg-gray-200 dark:bg-gray-700')}>
                <button
                  onClick={() => handleSort('cur_yr_minus_2')}
                  className={cn('flex items-center justify-end ml-auto hover:opacity-70 transition-opacity', sortField === 'cur_yr_minus_2' && 'font-semibold')}
                >
                  {currentYear - 2}
                  <SortIcon field="cur_yr_minus_2" />
                </button>
              </TableHead>
              <TableHead className={cn('sticky top-0 z-20 text-right w-16 bg-muted', sortField === 'cur_yr_minus_1' && 'bg-gray-200 dark:bg-gray-700')}>
                <button
                  onClick={() => handleSort('cur_yr_minus_1')}
                  className={cn('flex items-center justify-end ml-auto hover:opacity-70 transition-opacity', sortField === 'cur_yr_minus_1' && 'font-semibold')}
                >
                  {currentYear - 1}
                  <SortIcon field="cur_yr_minus_1" />
                </button>
              </TableHead>
              <TableHead className={cn('sticky top-0 z-20 text-right w-16 border-l-2 border-r-2 border-gray-700 bg-muted', sortField === 'cur_yr_est' && 'bg-gray-200 dark:bg-gray-700')}>
                <button
                  onClick={() => handleSort('cur_yr_est')}
                  className={cn('flex items-center justify-end ml-auto hover:opacity-70 transition-opacity', sortField === 'cur_yr_est' && 'font-semibold')}
                >
                  {currentYear} Est.
                  <SortIcon field="cur_yr_est" />
                </button>
              </TableHead>
              <TableHead className="sticky top-0 z-20 w-14 bg-muted">
                Trend
              </TableHead>
              <TableHead className={cn('sticky top-0 z-20 text-right w-20 bg-muted', sortField === 'cur_yr_est_vs_last_yr' && 'bg-gray-200 dark:bg-gray-700')}>
                <button
                  onClick={() => handleSort('cur_yr_est_vs_last_yr')}
                  className={cn('flex items-center justify-end ml-auto hover:opacity-70 transition-opacity', sortField === 'cur_yr_est_vs_last_yr' && 'font-semibold')}
                >
                  Delta vs Last Yr
                  <SortIcon field="cur_yr_est_vs_last_yr" />
                </button>
              </TableHead>
              <TableHead className={cn('sticky top-0 z-20 text-right w-20 bg-muted', sortField === 'cur_yr_est_vs_4yr_avg' && 'bg-gray-200 dark:bg-gray-700')}>
                <button
                  onClick={() => handleSort('cur_yr_est_vs_4yr_avg')}
                  className={cn('flex items-center justify-end ml-auto hover:opacity-70 transition-opacity', sortField === 'cur_yr_est_vs_4yr_avg' && 'font-semibold')}
                >
                  Delta vs 4Yr Avg
                  <SortIcon field="cur_yr_est_vs_4yr_avg" />
                </button>
              </TableHead>
            </TableRow>
            {/* Total Row */}
            <TableRow className="bg-muted/50 border-b-2 border-gray-700">
              <TableCell className="font-semibold w-28 min-w-[7rem] bg-muted/50">Total</TableCell>
              <TableCell className="text-right font-semibold w-16 bg-muted/50" style={getAnnualBgStyle(totals.cur_yr_minus_4)}>
                {formatCurrencyWithParens(-totals.cur_yr_minus_4)}
              </TableCell>
              <TableCell className="text-right font-semibold w-16 bg-muted/50" style={getAnnualBgStyle(totals.cur_yr_minus_3)}>
                {formatCurrencyWithParens(-totals.cur_yr_minus_3)}
              </TableCell>
              <TableCell className="text-right font-semibold w-16 bg-muted/50" style={getAnnualBgStyle(totals.cur_yr_minus_2)}>
                {formatCurrencyWithParens(-totals.cur_yr_minus_2)}
              </TableCell>
              <TableCell className="text-right font-semibold w-16 bg-muted/50" style={getAnnualBgStyle(totals.cur_yr_minus_1)}>
                {formatCurrencyWithParens(-totals.cur_yr_minus_1)}
              </TableCell>
              <TableCell className="text-right font-semibold w-16 border-l-2 border-r-2 border-gray-700 bg-muted/50" style={getAnnualBgStyle(totals.cur_yr_est)}>
                {formatCurrencyWithParens(-totals.cur_yr_est)}
              </TableCell>
              <TableCell className="text-right w-14 bg-muted/50">
                {/* Sparkline for total with tooltip */}
                <Sparkline row={{
                  category: 'Total',
                  cur_yr_minus_4: totals.cur_yr_minus_4,
                  cur_yr_minus_3: totals.cur_yr_minus_3,
                  cur_yr_minus_2: totals.cur_yr_minus_2,
                  cur_yr_minus_1: totals.cur_yr_minus_1,
                  cur_yr_est: totals.cur_yr_est,
                  cur_yr_est_vs_4yr_avg: totals.cur_yr_est_vs_4yr_avg,
                } as typeof processedData[0]} />
              </TableCell>
              <TableCell className="text-right font-semibold w-20 bg-muted/50">
                <DeltaCell value={totals.cur_yr_est_vs_last_yr} maxValue={maxValues.deltaVsLastYear} />
              </TableCell>
              <TableCell className="text-right font-semibold w-20 bg-muted/50">
                <DeltaCell value={totals.cur_yr_est_vs_4yr_avg} maxValue={maxValues.delta} />
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processedData.map((row) => {
              return (
                <TableRow key={row.category}>
                  <TableCell className="font-medium w-28 min-w-[7rem]">{row.category}</TableCell>
                  
                  {/* Annual columns with color-coded backgrounds */}
                  <TableCell className="text-right w-16" style={getAnnualBgStyle(row.cur_yr_minus_4)}>
                    {row.cur_yr_minus_4 === 0 ? '-' : formatCurrencyWithParens(-row.cur_yr_minus_4)}
                  </TableCell>
                  <TableCell className="text-right w-16" style={getAnnualBgStyle(row.cur_yr_minus_3)}>
                    {row.cur_yr_minus_3 === 0 ? '-' : formatCurrencyWithParens(-row.cur_yr_minus_3)}
                  </TableCell>
                  <TableCell className="text-right w-16" style={getAnnualBgStyle(row.cur_yr_minus_2)}>
                    {row.cur_yr_minus_2 === 0 ? '-' : formatCurrencyWithParens(-row.cur_yr_minus_2)}
                  </TableCell>
                  <TableCell className="text-right w-16" style={getAnnualBgStyle(row.cur_yr_minus_1)}>
                    {row.cur_yr_minus_1 === 0 ? '-' : formatCurrencyWithParens(-row.cur_yr_minus_1)}
                  </TableCell>
                  <TableCell className="text-right w-16 border-l-2 border-r-2 border-gray-700" style={getAnnualBgStyle(row.cur_yr_est)}>
                    {row.cur_yr_est === 0 ? '-' : formatCurrencyWithParens(-row.cur_yr_est)}
                  </TableCell>
                  
                  {/* Sparkline Trend */}
                  <TableCell className="text-right w-14">
                    <Sparkline row={row} />
                  </TableCell>
                  
                  {/* Delta vs Last Year */}
                  <TableCell className="text-right w-20">
                    <DeltaCell 
                      value={row.cur_yr_est - row.cur_yr_minus_1} 
                      maxValue={maxValues.deltaVsLastYear} 
                    />
                  </TableCell>
                  
                  {/* Delta vs 4Yr Avg */}
                  <TableCell className="text-right w-20">
                    <DeltaCell 
                      value={row.cur_yr_est_vs_4yr_avg} 
                      maxValue={maxValues.delta} 
                    />
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
