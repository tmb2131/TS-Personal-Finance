'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { useChartTheme } from '@/lib/hooks/use-chart-theme'
import { getChartFontSizes, getChartTooltipContentStyle, getChartTooltipWrapperStyle } from '@/lib/chart-styles'
import { HistoricalNetWorth } from '@/lib/types'
import { EditNetWorthHistoryDialog } from './edit-net-worth-history-dialog'
import { TrendingUp, AlertCircle } from 'lucide-react'
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
} from 'recharts'

// Net worth category colors - using app's design system palette
const PERSONAL_FILL = '#3b82f6' // Blue-500
const FAMILY_FILL = '#22c55e' // Green-500 (matches app's positive/growth color)
const TRUST_FILL = '#8b5cf6' // Violet-500
const TOTAL_LINE_STROKE = '#1e40af' // Blue-800 (darker blue for emphasis)

export type CurrentYearFromAccounts = {
  Personal: { amount_usd: number; amount_gbp: number }
  Family: { amount_usd: number; amount_gbp: number }
  Trust: { amount_usd: number; amount_gbp: number }
}

interface NetWorthChartProps {
  initialData?: HistoricalNetWorth[]
  /** Live snapshot from account_balances for current year bar (overrides historical_net_worth for current year). */
  currentYearFromAccounts?: CurrentYearFromAccounts | null
}

export function NetWorthChart({ initialData, currentYearFromAccounts }: NetWorthChartProps = {}) {
  const { currency } = useCurrency()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)
  const [showPersonal, setShowPersonal] = useState(true)
  const [showFamily, setShowFamily] = useState(true)
  const [showTrust, setShowTrust] = useState(true)
  const isMobile = useIsMobile()
  const chartTheme = useChartTheme()
  const [mounted, setMounted] = useState(false)
  const fontSizes = getChartFontSizes(isMobile)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Process data function - use useCallback to memoize with currency dependency
  const processData = useCallback(
    (netWorthData: HistoricalNetWorth[], currentYearSnapshot?: CurrentYearFromAccounts | null) => {
      const latestByYearCategory = new Map<string, { date: string; amount: number }>()

      netWorthData.forEach((item: HistoricalNetWorth) => {
        const date = new Date(item.date)
        const year = date.getFullYear()

        // Skip invalid dates or NaN years
        if (isNaN(year) || !isFinite(year)) {
          return
        }

        const amount = currency === 'USD' ? item.amount_usd : item.amount_gbp
        const amountValue = amount || 0
        const category = item.category === 'Personal' || item.category === 'Family' || item.category === 'Trust'
          ? item.category
          : null

        if (!category) return

        const dateKey = date.toISOString().slice(0, 10)
        const key = `${year}|${category}`
        const existing = latestByYearCategory.get(key)
        if (!existing || dateKey > existing.date) {
          latestByYearCategory.set(key, { date: dateKey, amount: amountValue })
        }
      })

      const currentYear = new Date().getFullYear()

      // Current year: use live snapshot from account_balances when provided
      if (currentYearSnapshot) {
        const today = new Date().toISOString().slice(0, 10)
        for (const cat of ['Personal', 'Family', 'Trust'] as const) {
          const amt = currency === 'USD' ? currentYearSnapshot[cat].amount_usd : currentYearSnapshot[cat].amount_gbp
          latestByYearCategory.set(`${currentYear}|${cat}`, { date: today, amount: amt })
        }
      } else if (netWorthData.length > 0) {
        // Fallback: ensure current year shows latest available when latest snapshot is from a prior year
        const maxDate = netWorthData.reduce((max, item) => {
          const d = item.date?.slice(0, 10)
          return d && (!max || d > max) ? d : max
        }, '')
        const maxYear = maxDate ? parseInt(maxDate.slice(0, 4), 10) : 0
        if (maxDate && maxYear < currentYear) {
          const amountsAtLatest = netWorthData.filter((item) => item.date?.slice(0, 10) === maxDate)
          for (const item of amountsAtLatest) {
            const category = item.category === 'Personal' || item.category === 'Family' || item.category === 'Trust' ? item.category : null
            if (category) {
              const amount = currency === 'USD' ? item.amount_usd : item.amount_gbp
              latestByYearCategory.set(`${currentYear}|${category}`, { date: maxDate, amount: amount ?? 0 })
            }
          }
        }
      }

      const grouped: Record<number, { year: number; Personal: number; Family: number; Trust: number; Total: number }> = {}
      latestByYearCategory.forEach((entry, key) => {
        const [yearStr, category] = key.split('|')
        const year = Number(yearStr)
        if (!grouped[year]) {
          grouped[year] = { year, Personal: 0, Family: 0, Trust: 0, Total: 0 }
        }
        if (category === 'Personal' || category === 'Family' || category === 'Trust') {
          grouped[year][category] = entry.amount
        }
      })

      Object.values(grouped).forEach((row) => {
        row.Total = (row.Personal || 0) + (row.Family || 0) + (row.Trust || 0)
      })

      return Object.values(grouped)
        .filter((item: any) => item.year != null && !isNaN(item.year) && isFinite(item.year) && item.Total > 0) // Only display years where total net worth > 0 (per PRD requirement)
        .sort((a: any, b: any) => a.year - b.year)
    },
    [currency]
  )

  // Use server-provided initialData; current year uses live snapshot from account_balances when provided
  useEffect(() => {
    if (initialData?.length) {
      const chartData = processData(initialData, currentYearFromAccounts)
      setData(chartData)
    } else {
      setData([])
    }
    setLoading(false)
  }, [currency, initialData, currentYearFromAccounts, processData])

  // Derive display data so we show initialData on first paint (avoids flash of empty before useEffect runs)
  const displayData = useMemo(
    () => (data.length ? data : (initialData?.length ? processData(initialData, currentYearFromAccounts) : [])),
    [data, initialData, currentYearFromAccounts, processData]
  )

  // Check if there's any Family data
  const hasFamilyData = useMemo(() => {
    return displayData.some((item: any) => item.Family && Math.abs(item.Family) > 0)
  }, [displayData])

  // Check if there's any Trust data
  const hasTrustData = useMemo(() => {
    return displayData.some((item: any) => item.Trust && Math.abs(item.Trust) > 0)
  }, [displayData])

  // Auto-hide Family if no Family data exists
  useEffect(() => {
    if (!hasFamilyData && showFamily) {
      setShowFamily(false)
    }
  }, [hasFamilyData, showFamily])

  // Auto-hide Trust if no Trust data exists
  useEffect(() => {
    if (!hasTrustData && showTrust) {
      setShowTrust(false)
    }
  }, [hasTrustData, showTrust])

  // Filter data based on selected categories
  const filteredData = useMemo(() => {
    return displayData
      .filter((item: any) => item.year != null && !isNaN(item.year) && isFinite(item.year))
      .map((item: any) => {
        const filtered: any = { year: Number(item.year) }
        let total = 0

        if (showPersonal) {
          filtered.Personal = item.Personal || 0
          total += item.Personal || 0
        }
        if (showFamily) {
          filtered.Family = item.Family || 0
          total += item.Family || 0
        }
        if (showTrust) {
          filtered.Trust = item.Trust || 0
          total += item.Trust || 0
        }

        filtered.Total = total
        return filtered
      })
  }, [displayData, showPersonal, showFamily, showTrust])

  const chartHeader = (
    <div className="flex items-center justify-between gap-3">
      <CardTitle className="text-xl">Net Worth Over Time</CardTitle>
      <EditNetWorthHistoryDialog />
    </div>
  )

  if (loading) {
    return (
      <Card>
        <CardHeader>
          {chartHeader}
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 pb-4 border-b">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center space-x-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          {chartHeader}
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

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          {chartHeader}
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={TrendingUp}
            title="No net worth data available"
            description="Historical net worth data has not been synced yet. Please refresh the data to load this information."
          />
        </CardContent>
      </Card>
    )
  }

  // Defer chart render until after mount to avoid hydration mismatch (isMobile / Recharts differ server vs client)
  if (!mounted) {
    return (
      <Card>
        <CardHeader>
          {chartHeader}
        </CardHeader>
        <CardContent className="pt-6 md:pt-6">
          <div className="flex flex-wrap gap-4 mb-6 pb-4 border-b">
            <div className="flex items-center space-x-2">
              <div className="h-4 w-4 rounded border border-input" />
              <span className="text-sm">Personal</span>
            </div>
          {hasFamilyData && (
            <div className="flex items-center space-x-2">
              <div className="h-4 w-4 rounded border border-input" />
              <span className="text-sm">Family</span>
            </div>
          )}
          {hasTrustData && (
            <div className="flex items-center space-x-2">
              <div className="h-4 w-4 rounded border border-input" />
              <span className="text-sm">Trust</span>
            </div>
          )}
          </div>
          <Skeleton className="h-[320px] w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        {chartHeader}
      </CardHeader>
      <CardContent className="pt-6 md:pt-6">
        {/* Category Filters — hidden on mobile to free space for chart */}
        <div className="hidden sm:flex flex-wrap gap-4 mb-6 pb-4 border-b">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="filter-personal"
              checked={showPersonal}
              onCheckedChange={(checked) => setShowPersonal(checked === true)}
            />
            <Label htmlFor="filter-personal" className="text-sm font-normal cursor-pointer">
              Personal
            </Label>
          </div>
          {hasFamilyData && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="filter-family"
                checked={showFamily}
                onCheckedChange={(checked) => setShowFamily(checked === true)}
              />
              <Label htmlFor="filter-family" className="text-sm font-normal cursor-pointer">
                Family
              </Label>
            </div>
          )}
          {hasTrustData && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="filter-trust"
                checked={showTrust}
                onCheckedChange={(checked) => setShowTrust(checked === true)}
              />
              <Label htmlFor="filter-trust" className="text-sm font-normal cursor-pointer">
                Trust
              </Label>
            </div>
          )}
        </div>

        <ResponsiveContainer width="100%" height={isMobile ? 260 : 320}>
          <ComposedChart data={filteredData} margin={isMobile ? { top: 30, right: 10, left: 0, bottom: 5 } : { top: 50, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
            <XAxis
              dataKey="year"
              tick={{ fontSize: fontSizes.axisTick, fill: chartTheme.labelFill }}
              stroke={chartTheme.axisStroke}
              tickCount={isMobile ? 5 : undefined}
              interval={isMobile ? 'preserveStartEnd' : undefined}
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
              width={isMobile ? 60 : 80}
            />
            <Tooltip
              wrapperStyle={getChartTooltipWrapperStyle(chartTheme)}
              formatter={(value: number) =>
                new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: currency,
                }).format(value)
              }
              contentStyle={getChartTooltipContentStyle(chartTheme, { fontSize: fontSizes.tooltipMin, isMobile })}
            />
            <Legend 
              wrapperStyle={{ 
                paddingTop: isMobile ? '10px' : '20px', 
                fontSize: fontSizes.legend,
              }}
              iconType="square"
              iconSize={fontSizes.iconSize}
              formatter={(value) => <span style={{ fontSize: fontSizes.legend, marginRight: isMobile ? '16px' : '24px' }}>{value}</span>}
            />
            {showPersonal && (
              <Bar
                dataKey="Personal"
                fill={PERSONAL_FILL}
                radius={[4, 4, 0, 0]}
                stroke="#fff"
                strokeWidth={1}
              />
            )}
            {showFamily && (
              <Bar
                dataKey="Family"
                fill={FAMILY_FILL}
                radius={[4, 4, 0, 0]}
                stroke="#fff"
                strokeWidth={1}
              />
            )}
            {showTrust && (
              <Bar
                dataKey="Trust"
                fill={TRUST_FILL}
                radius={[4, 4, 0, 0]}
                stroke="#fff"
                strokeWidth={1}
              />
            )}
            <Line
              type="monotone"
              dataKey="Total"
              stroke={TOTAL_LINE_STROKE}
              strokeWidth={2}
              dot={{ fill: TOTAL_LINE_STROKE, r: 3 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
