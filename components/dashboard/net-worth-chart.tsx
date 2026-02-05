'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { getChartFontSizes } from '@/lib/chart-styles'
import { createClient } from '@/lib/supabase/client'
import { HistoricalNetWorth } from '@/lib/types'
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

interface NetWorthChartProps {
  initialData?: HistoricalNetWorth[]
}

export function NetWorthChart({ initialData }: NetWorthChartProps = {}) {
  const { currency } = useCurrency()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)
  const [showPersonal, setShowPersonal] = useState(true)
  const [showFamily, setShowFamily] = useState(true)
  const [showTrust, setShowTrust] = useState(true)
  const isMobile = useIsMobile()
  const [mounted, setMounted] = useState(false)
  const fontSizes = getChartFontSizes(isMobile)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Process data function - use useCallback to memoize with currency dependency
  const processData = useCallback((netWorthData: HistoricalNetWorth[]) => {
    const grouped = netWorthData.reduce((acc: any, item: HistoricalNetWorth) => {
      const date = new Date(item.date)
      const year = date.getFullYear()
      
      // Skip invalid dates or NaN years
      if (isNaN(year) || !isFinite(year)) {
        return acc
      }
      
      const amount = currency === 'USD' ? item.amount_usd : item.amount_gbp

      if (!acc[year]) {
        acc[year] = { year, Personal: 0, Family: 0, Trust: 0, Total: 0 }
      }

      if (item.category === 'Personal') {
        acc[year].Personal += amount || 0
      } else if (item.category === 'Family') {
        acc[year].Family += amount || 0
      } else if (item.category === 'Trust') {
        acc[year].Trust += amount || 0
      }
      acc[year].Total += amount || 0

      return acc
    }, {})

    return Object.values(grouped)
      .filter((item: any) => item.year != null && !isNaN(item.year) && isFinite(item.year) && item.Total > 0) // Only display years where total net worth > 0 (per PRD requirement)
      .sort((a: any, b: any) => a.year - b.year)
  }, [currency])

  // Use initial data if provided, or fetch when currency changes
  useEffect(() => {
    // If we have initial data, reprocess it when currency changes
    if (initialData) {
      const chartData = processData(initialData)
      setData(chartData)
      setLoading(false)
      return
    }

    // Otherwise fetch fresh data
    async function fetchData() {
      setLoading(true)
      const supabase = createClient()
      const { data: netWorthData, error } = await supabase
        .from('historical_net_worth')
        .select('*')
        .order('date', { ascending: true })

      if (error) {
        console.error('Error fetching net worth:', error)
        setError('Failed to load net worth data. Please try refreshing the page.')
        setLoading(false)
        return
      }

      const chartData = processData(netWorthData)
      setData(chartData)
      setLoading(false)
    }

    fetchData()
  }, [currency, initialData, processData])

  // Derive display data so we show initialData on first paint (avoids flash of empty before useEffect runs)
  const displayData = useMemo(
    () => (data.length ? data : (initialData?.length ? processData(initialData) : [])),
    [data, initialData, processData]
  )

  // Check if there's any Trust data
  const hasTrustData = useMemo(() => {
    return displayData.some((item: any) => item.Trust && Math.abs(item.Trust) > 0)
  }, [displayData])

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

  if (loading) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <Skeleton className="h-6 w-48" />
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
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Net Worth Over Time</CardTitle>
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
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Net Worth Over Time</CardTitle>
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
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Net Worth Over Time</CardTitle>
        </CardHeader>
        <CardContent className="pt-8">
          <div className="flex flex-wrap gap-4 mb-6 pb-4 border-b">
            <div className="flex items-center space-x-2">
              <div className="h-4 w-4 rounded border border-input" />
              <span className="text-sm">Personal</span>
            </div>
          <div className="flex items-center space-x-2">
            <div className="h-4 w-4 rounded border border-input" />
            <span className="text-sm">Family</span>
          </div>
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
      <CardHeader className="bg-muted/50">
        <CardTitle className="text-xl">Net Worth Over Time</CardTitle>
      </CardHeader>
      <CardContent className="pt-8">
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
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="year"
              tick={{ fontSize: fontSizes.axisTick }}
              stroke="#6b7280"
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
              tick={{ fontSize: fontSizes.axisTick }}
              stroke="#6b7280"
              width={isMobile ? 60 : 80}
            />
            <Tooltip
              formatter={(value: number) =>
                new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: currency,
                }).format(value)
              }
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: isMobile ? '6px 10px' : '8px 12px',
                fontSize: `${fontSizes.tooltipMin}px`,
              }}
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
