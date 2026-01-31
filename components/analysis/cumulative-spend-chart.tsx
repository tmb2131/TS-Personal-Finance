'use client'

import { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { getChartFontSizes } from '@/lib/chart-styles'
import { createClient } from '@/lib/supabase/client'
import { TransactionLog } from '@/lib/types'
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
} from 'recharts'

const EXCLUDED_CATEGORIES = ['Income', 'Gift Money', 'Other Income', 'Excluded']

export function CumulativeSpendChart() {
  const { currency, fxRate } = useCurrency()
  const isMobile = useIsMobile()
  const [transactions, setTransactions] = useState<TransactionLog[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('Total Expenses')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch transactions for current year
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const supabase = createClient()
      
      const currentYear = new Date().getFullYear()
      const startOfYear = new Date(currentYear, 0, 1)
      startOfYear.setHours(0, 0, 0, 0)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      const startDateStr = startOfYear.toISOString().split('T')[0]
      const todayDateStr = today.toISOString().split('T')[0]
      
      const { data, error } = await supabase
        .from('transaction_log')
        .select('*')
        .gte('date', startDateStr)
        .lte('date', todayDateStr)
        .order('date', { ascending: true })

      if (error) {
        console.error('Error fetching transactions:', error)
        setError('Failed to load transaction data. Please try refreshing the page.')
        setLoading(false)
        return
      }

      setError(null)
      
      // Filter out excluded categories and get unique expense categories
      const expenseTransactions = (data || []).filter(
        (tx: TransactionLog) => !EXCLUDED_CATEGORIES.includes(tx.category || '')
      )
      
      const uniqueCategories = Array.from(
        new Set(expenseTransactions.map((tx: TransactionLog) => tx.category).filter(Boolean))
      ).sort() as string[]
      
      setCategories(['Total Expenses', ...uniqueCategories])
      setTransactions(expenseTransactions as TransactionLog[])
      setLoading(false)
    }

    fetchData()
  }, [currency]) // Refetch when currency changes

  // Calculate chart data
  const chartData = useMemo(() => {
    if (!transactions.length) return []

    const currentYear = new Date().getFullYear()
    const startOfYear = new Date(currentYear, 0, 1)
    startOfYear.setHours(0, 0, 0, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    // Filter transactions based on selected category
    const filteredTransactions = selectedCategory === 'Total Expenses'
      ? transactions
      : transactions.filter((tx) => tx.category === selectedCategory)

    // Deduplicate transactions by date, category, and amount (ignore counterparty as it may vary)
    // Use a Map with a composite key to identify unique transactions
    const uniqueTransactions = new Map<string, TransactionLog>()
    filteredTransactions.forEach((tx) => {
      if (!tx.date) return
      
      // Ensure we're not including excluded categories (double-check)
      if (EXCLUDED_CATEGORIES.includes(tx.category || '')) {
        return
      }
      
      // Parse date string directly to avoid timezone issues
      const dateStr = typeof tx.date === 'string' ? tx.date.split('T')[0] : new Date(tx.date).toISOString().split('T')[0]
      
      // Create a unique key based on date, category, and amounts only
      // This will deduplicate transactions that have the same date, category, and amounts
      // We ignore counterparty as duplicates may have slight variations
      const amountGbp = tx.amount_gbp ?? 0
      const amountUsd = tx.amount_usd ?? 0
      const uniqueKey = `${dateStr}|${tx.category}|${amountGbp}|${amountUsd}`
      
      // Only keep the first occurrence of each unique transaction
      if (!uniqueTransactions.has(uniqueKey)) {
        uniqueTransactions.set(uniqueKey, tx)
      }
    })

    // Group deduplicated transactions by date and calculate daily totals
    const dailyTotals = new Map<string, number>()
    
    uniqueTransactions.forEach((tx) => {
      // Parse date string directly to avoid timezone issues
      const dateStr = typeof tx.date === 'string' ? tx.date.split('T')[0] : new Date(tx.date).toISOString().split('T')[0]
      
      // Get amount in selected currency
      // Expenses are stored as negative values in transaction_log
      // Only include expenses (negative values), exclude income (positive values)
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
      
      // Use absolute value for expenses (they're stored as negative)
      // Only sum expenses (negative amounts), ignore income (positive amounts)
      if (amount < 0) {
        dailyTotals.set(dateStr, (dailyTotals.get(dateStr) || 0) + Math.abs(amount))
      }
    })
    
    // Debug logging (remove in production if needed)
    if (selectedCategory === 'Business') {
      console.log('Business transactions (before deduplication):', filteredTransactions.length)
      console.log('Business transactions (after deduplication):', uniqueTransactions.size)
      console.log('Business daily totals:', Array.from(dailyTotals.entries()))
      const totalYTD = Array.from(dailyTotals.values()).reduce((sum, val) => sum + val, 0)
      console.log('Business total YTD:', totalYTD)
    }

    // Create array of all dates from start of year to today (inclusive)
    const dateArray: string[] = []
    const startDateStr = startOfYear.toISOString().split('T')[0]
    const todayDateStr = today.toISOString().split('T')[0]
    const currentDate = new Date(startOfYear)
    
    // Use string comparison to avoid timezone issues
    let currentDateStr = currentDate.toISOString().split('T')[0]
    while (currentDateStr <= todayDateStr) {
      dateArray.push(currentDateStr)
      currentDate.setDate(currentDate.getDate() + 1)
      currentDateStr = currentDate.toISOString().split('T')[0]
    }

    // Calculate YTD spend and implied annual spend for each date
    let ytdSpend = 0
    const chartDataPoints = dateArray.map((date) => {
      const dailySpend = dailyTotals.get(date) || 0
      ytdSpend += dailySpend
      
      // Calculate % of year passed
      const dateObj = new Date(date)
      const daysSinceStartOfYear = Math.floor(
        (dateObj.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)
      ) + 1
      
      // Check if current year is a leap year
      const isLeapYear = (year: number) => {
        return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)
      }
      const totalDaysInYear = isLeapYear(currentYear) ? 366 : 365
      
      const percentOfYear = daysSinceStartOfYear / totalDaysInYear
      
      // Calculate implied annual spend (YTD / % of year)
      const impliedAnnualSpend = percentOfYear > 0 
        ? ytdSpend / percentOfYear 
        : 0

      return {
        date,
        dateLabel: new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        ytdSpend,
        impliedAnnualSpend,
      }
    })

    return chartDataPoints
  }, [transactions, selectedCategory, currency, fxRate])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>YTD Spend Over Time</CardTitle>
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
          <CardTitle>YTD Spend Over Time</CardTitle>
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
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <CardTitle>YTD Spend Over Time</CardTitle>
          <div className="flex items-center gap-2">
            <label htmlFor="category-select" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
              Category:
            </label>
            <select
              id="category-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="flex h-10 w-full md:w-64 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <EmptyState
            icon={AlertCircle}
            title="No data available"
            description="No transactions found for the selected category."
          />
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData} margin={{ top: 5, right: 50, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="dateLabel"
                tick={{ fontSize: getChartFontSizes(isMobile).axisTick }}
                stroke="#6b7280"
                angle={-45}
                textAnchor="end"
                height={isMobile ? 60 : 80}
                interval="preserveStartEnd"
                minTickGap={isMobile ? 40 : 30}
                tickCount={isMobile ? 5 : undefined}
              />
              <YAxis
                yAxisId="left"
                tickFormatter={(value) =>
                  new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: currency,
                    notation: 'compact',
                    maximumFractionDigits: 0,
                  }).format(value)
                }
                tick={{ fontSize: getChartFontSizes(isMobile).axisTick }}
                stroke="#6b7280"
                width={isMobile ? 48 : 60}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={(value) =>
                  new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: currency,
                    notation: 'compact',
                    maximumFractionDigits: 0,
                  }).format(value)
                }
                tick={{ fontSize: getChartFontSizes(isMobile).axisTick }}
                stroke="#82ca9d"
                width={isMobile ? 48 : 60}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  formatCurrency(value),
                  name === 'ytdSpend' ? 'YTD Spend' : 'Implied Annual Spend',
                ]}
                labelFormatter={(label) => {
                  const dataPoint = chartData.find((d) => d.dateLabel === label)
                  return dataPoint ? new Date(dataPoint.date).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  }) : label
                }}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  fontSize: getChartFontSizes(isMobile).tooltipMin,
                }}
              />
              <Legend
                formatter={(value) =>
                  value === 'ytdSpend' ? 'YTD Spend' : 'Implied Annual Spend'
                }
                wrapperStyle={{ fontSize: getChartFontSizes(isMobile).legend }}
                iconSize={getChartFontSizes(isMobile).iconSize}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="ytdSpend"
                stroke="#8884d8"
                strokeWidth={2}
                dot={false}
                name="ytdSpend"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="impliedAnnualSpend"
                stroke="#82ca9d"
                strokeWidth={2}
                dot={false}
                name="impliedAnnualSpend"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
