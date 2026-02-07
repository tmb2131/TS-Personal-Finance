'use client'

import { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { useChartTheme } from '@/lib/hooks/use-chart-theme'
import { getChartFontSizes } from '@/lib/chart-styles'
import { createClient } from '@/lib/supabase/client'
import { TransactionLog, BudgetTarget, AnnualTrend } from '@/lib/types'
import { AlertCircle } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  TooltipProps,
} from 'recharts'

const EXCLUDED_CATEGORIES = ['Income', 'Gift Money', 'Other Income', 'Excluded']

export function AnnualCumulativeSpendChart() {
  const { currency, fxRate } = useCurrency()
  const isMobile = useIsMobile()
  const chartTheme = useChartTheme()
  const [transactions, setTransactions] = useState<TransactionLog[]>([])
  const [budgetData, setBudgetData] = useState<BudgetTarget[]>([])
  const [annualTrends, setAnnualTrends] = useState<AnnualTrend[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // On mobile, default to only Current Year + Budget; on desktop show all years
  const [showHistoricalYears, setShowHistoricalYears] = useState(false)
  useEffect(() => {
    setShowHistoricalYears(!isMobile)
  }, [isMobile])

  // Fetch transactions, budget data, and annual_trends (authoritative year totals)
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const supabase = createClient()
      
      const currentYear = new Date().getFullYear()
      
      // Fetch budget data and annual_trends in parallel with transactions
      const [budgetsResult, annualTrendsResult] = await Promise.all([
        supabase.from('budget_targets').select('*'),
        supabase.from('annual_trends').select('*').order('category'),
      ])
      
      // Fetch all transactions with pagination
      let allTransactions: TransactionLog[] = []
      let page = 0
      const pageSize = 1000
      let hasMore = true
      
      while (hasMore) {
        const from = page * pageSize
        const to = from + pageSize - 1
        
        const transactionsResult = await supabase
          .from('transaction_log')
          .select('*', { count: 'exact' })
          .order('date', { ascending: true })
          .range(from, to)
        
        if (transactionsResult.error) {
          console.error('Error fetching transactions:', transactionsResult.error)
          setError('Failed to load transaction data. Please try refreshing the page.')
          setLoading(false)
          return
        }
        
        const pageTransactions = transactionsResult.data || []
        allTransactions = [...allTransactions, ...pageTransactions]
        
        // If we got fewer results than requested, we've reached the end
        hasMore = pageTransactions.length === pageSize
        
        if (page === 0) {
          console.log(`Total transactions in database: ${transactionsResult.count}`)
        }
        
        page++
      }
      
      console.log(`Fetched ${allTransactions.length} transactions total`)

      if (budgetsResult.error) {
        console.error('Error fetching budget data:', budgetsResult.error)
        setError('Failed to load budget data. Please try refreshing the page.')
        setLoading(false)
        return
      }

      if (!annualTrendsResult.error && annualTrendsResult.data) {
        setAnnualTrends(annualTrendsResult.data as AnnualTrend[])
      }

      setError(null)
      
      // Filter out excluded categories
      const expenseTransactions = allTransactions.filter(
        (tx: TransactionLog) => !EXCLUDED_CATEGORIES.includes(tx.category || '')
      )
      
      // Debug: Log transaction counts by year with sample dates
      const transactionsByYear = new Map<number, number>()
      const sampleDatesByYear = new Map<number, string[]>()
      const dateRange = { min: '', max: '' }
      
      expenseTransactions.forEach((tx: TransactionLog, idx: number) => {
        if (!tx.date) return
        
        // Parse date - Supabase returns DATE as string in YYYY-MM-DD format
        const dateStr = typeof tx.date === 'string' ? tx.date.split('T')[0] : new Date(tx.date).toISOString().split('T')[0]
        const year = parseInt(dateStr.split('-')[0])
        
        if (isNaN(year)) {
          console.warn(`Invalid year parsed from date: ${tx.date} -> ${dateStr}`)
          return
        }
        
        transactionsByYear.set(year, (transactionsByYear.get(year) || 0) + 1)
        
        // Track date range
        if (!dateRange.min || dateStr < dateRange.min) dateRange.min = dateStr
        if (!dateRange.max || dateStr > dateRange.max) dateRange.max = dateStr
        
        // Store sample dates for each year
        if (!sampleDatesByYear.has(year)) {
          sampleDatesByYear.set(year, [])
        }
        const samples = sampleDatesByYear.get(year)!
        if (samples.length < 5) {
          samples.push(dateStr)
        }
      })
      
      console.log('Date range in transactions:', dateRange)
      console.log('Transactions by year:', Array.from(transactionsByYear.entries()))
      console.log('Sample dates by year:', Array.from(sampleDatesByYear.entries()))
      console.log('Total expense transactions:', expenseTransactions.length)
      
      // Log first and last few transactions to see their date format
      console.log('First 3 transactions:', expenseTransactions.slice(0, 3).map(tx => ({
        date: tx.date,
        dateType: typeof tx.date,
        category: tx.category
      })))
      console.log('Last 3 transactions:', expenseTransactions.slice(-3).map(tx => ({
        date: tx.date,
        dateType: typeof tx.date,
        category: tx.category
      })))
      
      setTransactions(expenseTransactions as TransactionLog[])
      setBudgetData((budgetsResult.data as BudgetTarget[]) || [])
      setLoading(false)
    }

    fetchData()
  }, [currency])

  // Calculate chart data
  const chartData = useMemo(() => {
    if (!transactions.length || !budgetData.length) return []

    const currentYear = new Date().getFullYear()
    const years = [currentYear - 4, currentYear - 3, currentYear - 2, currentYear - 1, currentYear]
    
    // Calculate total annual budget (sum of all expense categories). Use GBP as source of truth, convert to USD.
    const totalAnnualBudget = budgetData
      .filter((b) => !EXCLUDED_CATEGORIES.includes(b.category))
      .reduce((sum, b) => {
        const budget = currency === 'USD' ? (b.annual_budget_gbp ?? 0) * fxRate : (b.annual_budget_gbp ?? 0)
        return sum + Math.abs(budget) // Budgets are stored as negative for expenses
      }, 0)

    // Calculate 2026 estimated total spend from Budget Tracker (sum of tracking_est for expense categories). Use GBP as source of truth, convert to USD.
    const estimatedTotalSpend2026 = budgetData
      .filter((b) => !EXCLUDED_CATEGORIES.includes(b.category))
      .reduce((sum, b) => {
        const tracking = currency === 'USD' ? (b.tracking_est_gbp ?? 0) * fxRate : (b.tracking_est_gbp ?? 0)
        return sum + Math.abs(tracking) // Tracking values are stored as negative for expenses
      }, 0)

    // Calculate cumulative spend by day of year for each year
    const yearData = new Map<number, Map<number, number>>() // year -> dayOfYear -> cumulativeSpend
    
    years.forEach((year) => {
      yearData.set(year, new Map<number, number>())
    })

    // Process transactions and calculate cumulative spend by day of year
    // Deduplicate by (date, category, amount in GBP) so each logical transaction is counted once.
    // Source data can have the same expense as two rows (one amount_gbp, one amount_usd) with different DB keys; both round to the same GBP amount.
    const transactionMap = new Map<string, TransactionLog>()
    transactions.forEach((tx) => {
      if (!tx.date) return
      if (EXCLUDED_CATEGORIES.includes(tx.category || '')) return
      const amountGbp =
        tx.amount_gbp != null && tx.amount_gbp < 0
          ? Math.abs(tx.amount_gbp)
          : tx.amount_usd != null && tx.amount_usd < 0
            ? Math.abs(tx.amount_usd) / fxRate
            : 0
      if (amountGbp <= 0) return
      const dateStr = typeof tx.date === 'string' ? tx.date.split('T')[0] : new Date(tx.date).toISOString().split('T')[0]
      const amountKey = Math.round(amountGbp * 100) // pence for stability
      const logicalKey = `${dateStr}|${tx.category ?? ''}|${amountKey}`
      if (!transactionMap.has(logicalKey)) {
        transactionMap.set(logicalKey, tx)
      }
    })

    transactionMap.forEach((tx) => {
      if (!tx.date) return
      
      // Parse date string directly to avoid timezone issues
      let dateStr: string
      if (typeof tx.date === 'string') {
        dateStr = tx.date.split('T')[0]
      } else {
        // Handle Date object or other formats
        const dateObj = new Date(tx.date)
        dateStr = dateObj.toISOString().split('T')[0]
      }
      
      const [yearStr, monthStr, dayStr] = dateStr.split('-')
      if (!yearStr || !monthStr || !dayStr) {
        console.warn('Invalid date format:', tx.date, 'parsed as:', dateStr)
        return
      }
      
      const year = parseInt(yearStr)
      const month = parseInt(monthStr) - 1 // JavaScript months are 0-indexed
      const day = parseInt(dayStr)
      
      if (isNaN(year) || isNaN(month) || isNaN(day)) {
        console.warn('Invalid date values:', { yearStr, monthStr, dayStr, dateStr, originalDate: tx.date })
        return
      }
      
      if (!yearData.has(year)) {
        // Skip if year is not in our range (but log it for debugging)
        console.log(`Transaction from year ${year} is outside range ${years.join(', ')}`)
        return
      }
      
      // Calculate day of year (0-based, where Jan 1 = day 0)
      const startOfYear = new Date(Date.UTC(year, 0, 1))
      const txDate = new Date(Date.UTC(year, month, day))
      const dayOfYear = Math.floor((txDate.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24))
      
      // Ensure dayOfYear is valid (0-365)
      if (dayOfYear < 0 || dayOfYear > 365) {
        console.warn(`Invalid dayOfYear ${dayOfYear} for date ${dateStr}`)
        return
      }
      
      // Get amount in selected currency (expenses are negative)
      let amount = 0
      if (currency === 'USD') {
        if (tx.amount_usd != null && tx.amount_usd < 0) {
          amount = tx.amount_usd
        } else if (tx.amount_gbp != null && tx.amount_gbp < 0) {
          amount = tx.amount_gbp * fxRate
        }
      } else {
        if (tx.amount_gbp != null && tx.amount_gbp < 0) {
          amount = tx.amount_gbp
        } else if (tx.amount_usd != null && tx.amount_usd < 0) {
          amount = tx.amount_usd / fxRate
        }
      }
      
      if (amount < 0) {
        const yearMap = yearData.get(year)!
        const dailySpend = yearMap.get(dayOfYear) || 0
        yearMap.set(dayOfYear, dailySpend + Math.abs(amount))
      }
    })
    
    // Debug: Log transaction counts per year
    years.forEach((year) => {
      const yearMap = yearData.get(year)!
      const transactionCount = Array.from(yearMap.values()).filter(v => v > 0).length
      const totalSpend = Array.from(yearMap.values()).reduce((sum, val) => sum + val, 0)
      if (transactionCount > 0) {
        console.log(`Year ${year}: ${transactionCount} days with transactions, total spend: ${totalSpend}`)
      }
    })

    // Scale historical years to match annual_trends (authoritative source) so year-end totals are correct
    if (annualTrends.length > 0) {
      const yearToColumn: Record<number, keyof AnnualTrend> = {
        [currentYear - 4]: 'cur_yr_minus_4',
        [currentYear - 3]: 'cur_yr_minus_3',
        [currentYear - 2]: 'cur_yr_minus_2',
        [currentYear - 1]: 'cur_yr_minus_1',
      }
      years.forEach((year) => {
        if (year === currentYear) return
        const col = yearToColumn[year]
        if (!col) return
        const authoritativeTotal = annualTrends
          .filter((row) => !EXCLUDED_CATEGORIES.includes(row.category))
          .reduce((sum, row) => sum + Math.abs((row[col] as number) ?? 0), 0)
        const inDisplayCurrency = currency === 'USD' ? authoritativeTotal * fxRate : authoritativeTotal
        const yearMap = yearData.get(year)!
        const transactionTotal = Array.from(yearMap.values()).reduce((s, v) => s + v, 0)
        if (transactionTotal > 0 && inDisplayCurrency >= 0) {
          const scale = inDisplayCurrency / transactionTotal
          yearMap.forEach((value, day) => {
            yearMap.set(day, value * scale)
          })
        }
      })
    }

    // Create data points for each day of year (0-365)
    const isLeapYear = (year: number) => {
      return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)
    }
    
    const chartDataPoints: any[] = []
    const totalDaysInYear = 365
    
    for (let day = 0; day <= totalDaysInYear; day++) {
      const dataPoint: any = { dayOfYear: day }
      
      // Calculate cumulative spend for each year up to this day
      years.forEach((year) => {
        const yearMap = yearData.get(year)!
        let cumulative = 0
        
        // Sum all daily spend amounts from day 0 up to and including current day
        for (let d = 0; d <= day; d++) {
          const dailyAmount = yearMap.get(d)
          if (dailyAmount != null) {
            cumulative += dailyAmount
          }
        }
        
        dataPoint[`year${year}`] = cumulative
      })
      
      // Calculate budget line (linear progression)
      const percentOfYear = day / totalDaysInYear
      dataPoint.budget = totalAnnualBudget * percentOfYear
      
      chartDataPoints.push(dataPoint)
    }
    
    // Debug: Log sample data points to verify values
    console.log('Sample chart data points:', chartDataPoints.filter((_, idx) => idx % 50 === 0).slice(0, 5))

    // Calculate historical spending patterns for forecasting
    // Get total annual spend for each historical year
    const historicalYearTotals = new Map<number, number>()
    years.forEach((year) => {
      const yearMap = yearData.get(year)!
      const totalSpend = Array.from(yearMap.values()).reduce((sum, val) => sum + val, 0)
      historicalYearTotals.set(year, totalSpend)
    })

    // Calculate average cumulative spending pattern (as percentage of annual total) for each day
    const historicalPattern = new Map<number, number>() // dayOfYear -> average cumulative percentage
    
    for (let day = 0; day <= totalDaysInYear; day++) {
      let totalCumulativePercentage = 0
      let yearCount = 0
      
      years.forEach((year) => {
        const yearMap = yearData.get(year)!
        const yearTotal = historicalYearTotals.get(year) || 0
        
        if (yearTotal > 0) {
          // Calculate cumulative spend up to this day
          let cumulative = 0
          for (let d = 0; d <= day; d++) {
            const dailyAmount = yearMap.get(d)
            if (dailyAmount != null) {
              cumulative += dailyAmount
            }
          }
          
          // Convert to percentage of annual total
          const cumulativePercentage = cumulative / yearTotal
          totalCumulativePercentage += cumulativePercentage
          yearCount++
        }
      })
      
      // Average across all historical years
      const avgCumulativePercentage = yearCount > 0 ? totalCumulativePercentage / yearCount : 0
      historicalPattern.set(day, avgCumulativePercentage)
    }

    // For current year, split into actual and forecast
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const startOfCurrentYear = new Date(currentYear, 0, 1)
    startOfCurrentYear.setHours(0, 0, 0, 0)
    const daysSinceStartOfYear = Math.floor((today.getTime() - startOfCurrentYear.getTime()) / (1000 * 60 * 60 * 24))
    const currentYearYTD = chartDataPoints[daysSinceStartOfYear]?.[`year${currentYear}`] || 0
    
    // Use the estimated total spend from Budget Tracker as the target for the forecast
    // Scale the historical pattern so it reaches estimatedTotalSpend2026 at day 365
    const historicalYTDPercentage = historicalPattern.get(daysSinceStartOfYear) || 0
    const historicalEndPercentage = historicalPattern.get(totalDaysInYear) || 1.0
    
    // Calculate the remaining percentage of the year based on historical pattern
    const remainingHistoricalPercentage = historicalEndPercentage - historicalYTDPercentage
    
    // Calculate how much more we need to spend to reach the target
    const remainingSpendNeeded = estimatedTotalSpend2026 - currentYearYTD
    
    // Split current year data into actual and forecast using historical pattern
    chartDataPoints.forEach((dataPoint, day) => {
      const currentYearValue = dataPoint[`year${currentYear}`] || 0
      
      if (day < daysSinceStartOfYear) {
        // Actual data before today
        dataPoint.currentYearActual = currentYearValue
        dataPoint.currentYearForecast = undefined
      } else if (day === daysSinceStartOfYear) {
        // Transition point: both actual and forecast have the same value for smooth connection
        dataPoint.currentYearActual = currentYearValue
        dataPoint.currentYearForecast = currentYearValue
      } else {
        // Forecast data beyond today using historical pattern scaled to reach estimatedTotalSpend2026
        const historicalPercentage = historicalPattern.get(day) || 0
        const historicalProgressFromToday = historicalPercentage - historicalYTDPercentage
        
        // Scale the historical progress to match the remaining spend needed
        // If historical pattern says we should be at X% progress from today, scale that to the remaining spend
        const forecastedCumulative = remainingHistoricalPercentage > 0
          ? currentYearYTD + (remainingSpendNeeded * (historicalProgressFromToday / remainingHistoricalPercentage))
          : currentYearYTD + (remainingSpendNeeded * ((day - daysSinceStartOfYear) / (totalDaysInYear - daysSinceStartOfYear))) // Fallback to linear
        
        dataPoint.currentYearActual = undefined
        dataPoint.currentYearForecast = forecastedCumulative
      }
      
      // Remove the old year2026 key to avoid confusion
      delete dataPoint[`year${currentYear}`]
    })

    return chartDataPoints
  }, [transactions, budgetData, annualTrends, currency, fxRate])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatCurrencyCompact = (value: number) => {
    const valueInK = value / 1000
    const currencySymbol = currency === 'USD' ? '$' : '£'
    return `${currencySymbol}${valueInK.toFixed(0)}k`
  }

  const currentYear = new Date().getFullYear()
  const years = [currentYear - 4, currentYear - 3, currentYear - 2, currentYear - 1]
  
  // Helper to convert day of year to month index (0-11)
  const dayOfYearToMonth = (dayOfYear: number): number => {
    const date = new Date(currentYear, 0, dayOfYear + 1)
    return date.getMonth()
  }

  // Helper to get month name from day of year
  const getMonthName = (dayOfYear: number): string => {
    const month = dayOfYearToMonth(dayOfYear)
    return new Date(currentYear, month, 1).toLocaleDateString('en-GB', { month: 'short' })
  }

  // Calculate day of year for the start of each month (0-based)
  const getMonthStartDays = (): number[] => {
    const monthStarts: number[] = []
    for (let month = 0; month < 12; month++) {
      const date = new Date(currentYear, month, 1)
      const startOfYear = new Date(currentYear, 0, 1)
      const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24))
      monthStarts.push(dayOfYear)
    }
    return monthStarts
  }
  
  // Custom Tooltip Component
  const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (!active || !payload || !payload.length) return null

    const dayOfYear = typeof label === 'number' ? label : parseInt(label) || 0
    const monthName = getMonthName(dayOfYear)
    const day = dayOfYear + 1 // Convert 0-based to 1-based
    
    // Collect all values from payload
    const tooltipItems: Array<{ name: string; value: number; color: string }> = []
    
    payload.forEach((entry) => {
      // Skip undefined/null values
      if (entry.value == null || typeof entry.value !== 'number') return
      
      let displayName = ''
      if (entry.dataKey === 'currentYearActual') {
        displayName = `${currentYear} (Actual)`
      } else if (entry.dataKey === 'currentYearForecast') {
        displayName = `${currentYear} (Forecast)`
      } else if (entry.dataKey === 'budget') {
        displayName = 'Budget'
      } else if (typeof entry.dataKey === 'string' && entry.dataKey.startsWith('year')) {
        const year = parseInt(entry.dataKey.replace('year', ''))
        displayName = year.toString()
      } else {
        displayName = entry.dataKey?.toString() || ''
      }
      
      tooltipItems.push({
        name: displayName,
        value: entry.value,
        color: entry.color || '#000',
      })
    })
    
    // Sort by value (high to low)
    tooltipItems.sort((a, b) => b.value - a.value)
    
    return (
      <div className="bg-popover border border-border rounded-md shadow-lg p-3">
        <p className="font-semibold text-sm mb-2 text-popover-foreground">
          {monthName} {day} (Day {dayOfYear + 1})
        </p>
        <div className="space-y-1">
          {tooltipItems.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-muted-foreground">{item.name}</span>
              </div>
              <span className="font-medium text-popover-foreground">
                {formatCurrency(item.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Annual Cumulative Spend</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Annual Cumulative Spend</CardTitle>
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
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle>Annual Cumulative Spend</CardTitle>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="show-historical-years"
              checked={showHistoricalYears}
              onCheckedChange={(checked) => setShowHistoricalYears(checked === true)}
            />
            <Label htmlFor="show-historical-years" className="text-sm font-normal cursor-pointer whitespace-nowrap">
              Show historical years (2022–{currentYear - 1})
            </Label>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <EmptyState
            icon={AlertCircle}
            title="No data available"
            description="No transaction data found for the selected period."
          />
        ) : (
          <ResponsiveContainer width="100%" height={isMobile ? 260 : 320}>
            <LineChart data={chartData} margin={isMobile ? { top: 10, right: 10, left: 0, bottom: 5 } : { top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
              <XAxis
                dataKey="dayOfYear"
                tick={{ fontSize: getChartFontSizes(isMobile).axisTick, fill: chartTheme.labelFill }}
                stroke={chartTheme.axisStroke}
                ticks={getMonthStartDays()}
                tickFormatter={(value) => {
                  const month = dayOfYearToMonth(value)
                  return new Date(currentYear, month, 1).toLocaleDateString('en-GB', { month: 'short' })
                }}
                interval={isMobile ? 1 : 0}
                tickCount={isMobile ? 6 : undefined}
                />
              <YAxis
                tickFormatter={(value) => formatCurrencyCompact(value)}
                tick={{ fontSize: getChartFontSizes(isMobile).axisTick, fill: chartTheme.labelFill }}
                stroke={chartTheme.axisStroke}
                width={isMobile ? 48 : 60}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(value) => {
                  if (value === 'budget') return 'Budget'
                  if (value === 'currentYearActual') return `${currentYear} (Actual)`
                  if (value === 'currentYearForecast') return `${currentYear} (Forecast)`
                  if (typeof value === 'string' && value.startsWith('year')) {
                    const year = parseInt(value.replace('year', ''))
                    return year.toString()
                  }
                  return value
                }}
                wrapperStyle={{ paddingTop: '20px', fontSize: getChartFontSizes(isMobile).legend }}
                iconType="line"
                iconSize={getChartFontSizes(isMobile).iconSize}
              />
              {/* Background years (2022, 2023, 2024) — hidden on mobile by default */}
              {showHistoricalYears && years.slice(0, 3).map((year) => (
                <Line
                  key={year}
                  type="monotone"
                  dataKey={`year${year}`}
                  stroke="#e5e7eb"
                  strokeWidth={1}
                  dot={false}
                  name={`year${year}`}
                />
              ))}
              {/* Last year (e.g. 2025) — hidden on mobile by default */}
              {showHistoricalYears && years.length > 3 && (
                <Line
                  type="monotone"
                  dataKey={`year${years[3]}`}
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  name={`year${years[3]}`}
                />
              )}
              {/* Current year actual (2026) */}
              <Line
                type="monotone"
                dataKey="currentYearActual"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={false}
                name="currentYearActual"
              />
              {/* Current year forecast (2026) */}
              <Line
                type="monotone"
                dataKey="currentYearForecast"
                stroke="#3b82f6"
                strokeWidth={3}
                strokeDasharray="3 3"
                dot={false}
                name="currentYearForecast"
              />
              {/* Budget line */}
              <Line
                type="monotone"
                dataKey="budget"
                stroke="#374151"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                name="budget"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
