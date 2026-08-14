'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
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
import { TransactionLog } from '@/lib/types'
import { isExpenseCategory } from '@/lib/category-filters'
import {
  computeExpenseYtdByCategory,
  defaultExpenseYtdAsOf,
  expenseYtdMagnitude,
} from '@/lib/expense-ytd'
import { toLocalDateString } from '@/lib/date-utils'
import { fetchFxRatesUpTo, buildGetRateForDate } from '@/lib/utils/fx-rates'
import { Receipt, AlertCircle } from 'lucide-react'
import { cn } from '@/utils/cn'
import { FullTableViewWrapper } from '@/components/dashboard/full-table-view-wrapper'
import { FullTableViewToggle } from '@/components/dashboard/full-table-view-toggle'

interface AggregatedTransaction {
  counterpartyKey: string
  counterparty: string
  amount: number
  transactionCount: number
}

interface TransactionAnalysisProps {
  initialSection?: string
  initialPeriod?: 'YTD' | 'MTD'
  initialYear?: number
  initialMonth?: number
  initialCategory?: string
}

export function TransactionAnalysis({
  initialSection,
  initialPeriod,
  initialYear,
  initialMonth,
  initialCategory,
}: TransactionAnalysisProps = {}) {
  const { currency, convertAmount, fxRate } = useCurrency()
  const cardRef = useRef<HTMLDivElement>(null)
  const now = new Date()
  const [periodType, setPeriodType] = useState<'YTD' | 'MTD'>(
    initialPeriod ?? 'YTD'
  )
  const [selectedYear, setSelectedYear] = useState<number>(
    initialYear ?? now.getFullYear()
  )
  const [selectedMonth, setSelectedMonth] = useState<number>(
    initialMonth ?? now.getMonth() + 1
  )
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>(
    initialCategory ?? ''
  )
  const [transactions, setTransactions] = useState<TransactionLog[]>([])
  const [ratesByDate, setRatesByDate] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fullView, setFullView] = useState(false)

  // Scroll to Transaction Analysis section when opened via URL (e.g. from Dashboard trends)
  useEffect(() => {
    if (initialSection === 'transaction-analysis' && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [initialSection])

  // Get available years (last 5 years)
  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear()
    return Array.from({ length: 5 }, (_, i) => currentYear - i)
  }, [])

  // Fetch categories based on selected period
  useEffect(() => {
    async function fetchCategories() {
      setLoading(true)
      const supabase = createClient()
      
      const startDateStr =
        periodType === 'YTD'
          ? `${selectedYear}-01-01`
          : toLocalDateString(new Date(selectedYear, selectedMonth - 1, 1))
      const endDateStr =
        periodType === 'YTD'
          ? defaultExpenseYtdAsOf(selectedYear)
          : toLocalDateString(new Date(selectedYear, selectedMonth, 0))

      // Fetch unique categories for the selected period
      // Fetch all rows to ensure we get all categories (Supabase may paginate by default)
      const categoriesResult = await supabase
        .from('transaction_log')
        .select('category')
        .gte('date', startDateStr)
        .lte('date', endDateStr)
        .limit(10000) // Set a high limit to ensure we get all transactions

      if (categoriesResult.error) {
        console.error('Error fetching categories:', categoriesResult.error)
        setError('Failed to load transaction categories. Please try refreshing the page.')
        setLoading(false)
        return
      }

      if (categoriesResult.data && categoriesResult.data.length > 0) {
        // Get unique categories, filter out null/undefined, and sort them
        const uniqueCategories = Array.from(
          new Set(
            categoriesResult.data
              .map((row) => row.category)
              .filter((cat): cat is string => Boolean(cat) && isExpenseCategory(cat))
          )
        ).sort()
        
        console.log('Found categories for period:', uniqueCategories.length, uniqueCategories)
        
        setCategories(uniqueCategories)
        
        // Reset selected category if it's not in the new list
        if (uniqueCategories.length > 0) {
          if (!selectedCategory || !uniqueCategories.includes(selectedCategory)) {
            setSelectedCategory(uniqueCategories[0])
          }
        } else {
          setSelectedCategory('')
        }
      } else {
        console.log('No categories found for period')
        setCategories([])
        setSelectedCategory('')
      }
      setLoading(false)
    }

    fetchCategories()
  }, [periodType, selectedYear, selectedMonth])

  // Fetch transactions based on filters
  useEffect(() => {
    if (!selectedCategory || !isExpenseCategory(selectedCategory)) return

    async function fetchTransactions() {
      const supabase = createClient()

      const startDateStr =
        periodType === 'YTD'
          ? `${selectedYear}-01-01`
          : toLocalDateString(new Date(selectedYear, selectedMonth - 1, 1))
      const endDateStr =
        periodType === 'YTD'
          ? defaultExpenseYtdAsOf(selectedYear)
          : toLocalDateString(new Date(selectedYear, selectedMonth, 0))

      // Fetch all matching transactions with pagination (Supabase defaults to 1,000 rows)
      let allTransactions: TransactionLog[] = []
      let page = 0
      const pageSize = 1000
      let hasMore = true

      while (hasMore) {
        const from = page * pageSize
        const to = from + pageSize - 1
        const { data: pageData, error: pageError } = await supabase
          .from('transaction_log')
          .select('*')
          .eq('category', selectedCategory)
          .gte('date', startDateStr)
          .lte('date', endDateStr)
          .order('date', { ascending: false })
          .range(from, to)

        if (pageError) {
          console.error('Error fetching transactions:', pageError)
          setError('Failed to load transactions. Please try refreshing the page.')
          return
        }

        const rows = pageData || []
        allTransactions = [...allTransactions, ...rows]
        hasMore = rows.length === pageSize
        page++
      }

      setError(null)

      setTransactions(allTransactions)

      // Fetch historical FX rates for transaction dates (for null amount conversion)
      const txs = allTransactions
      if (txs.length > 0) {
        const maxDate = txs.reduce((max, tx) => {
          const d = typeof tx.date === 'string' ? tx.date.split('T')[0] : tx.date
          return d > max ? d : max
        }, '')
        const supabaseFx = createClient()
        const rates = await fetchFxRatesUpTo(supabaseFx, maxDate)
        setRatesByDate(rates)
      } else {
        setRatesByDate(new Map())
      }
    }

    fetchTransactions()
  }, [periodType, selectedYear, selectedMonth, selectedCategory])

  // Rate for a given date (transaction date when one of amount_usd/amount_gbp is null)
  const getRateForDate = useMemo(
    () => buildGetRateForDate(ratesByDate, fxRate),
    [ratesByDate, fxRate]
  )

  // Aggregate transactions by first 9 letters of counterparty (case-insensitive)
  const aggregatedTransactions = useMemo(() => {
    const grouped = new Map<string, AggregatedTransaction>()

    transactions.forEach((tx) => {
      const counterparty = tx.counterparty || 'Unknown'
      // Use case-insensitive key to prevent duplicates like "OURARING" vs "Ouraring"
      const counterpartyKey = counterparty.substring(0, 9).trim().toUpperCase()
      const rate = getRateForDate(typeof tx.date === 'string' ? tx.date : tx.date)
      // Use FX rate for transaction date when one side is null
      const amount = currency === 'USD'
        ? (tx.amount_usd ?? (tx.amount_gbp != null ? tx.amount_gbp * rate : 0))
        : (tx.amount_gbp ?? (tx.amount_usd != null ? tx.amount_usd / rate : 0))

      if (grouped.has(counterpartyKey)) {
        const existing = grouped.get(counterpartyKey)!
        existing.amount += amount
        existing.transactionCount += 1
        // Keep the most common casing (prefer title case over all caps if available)
        // For now, keep the first encountered counterparty name
      } else {
        grouped.set(counterpartyKey, {
          counterpartyKey,
          counterparty,
          amount,
          transactionCount: 1,
        })
      }
    })

    return Array.from(grouped.values())
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)) // Sort descending by absolute amount
  }, [transactions, currency, getRateForDate])

  // Calculate total spend and 80% threshold
  const { totalSpend, threshold80Percent } = useMemo(() => {
    const total = aggregatedTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
    return {
      totalSpend: total,
      threshold80Percent: total * 0.8,
    }
  }, [aggregatedTransactions])

  // Calculate cumulative totals and identify top 80% counterparties
  const transactionsWithCumulative = useMemo(() => {
    let cumulative = 0
    return aggregatedTransactions.map((tx) => {
      cumulative += Math.abs(tx.amount)
      return {
        ...tx,
        cumulative,
        isTop80Percent: cumulative <= threshold80Percent,
      }
    })
  }, [aggregatedTransactions, threshold80Percent])

  // Filter to only show top 80% in the default view (full view shows all)
  const displayedTransactions = useMemo(() => {
    if (fullView) {
      return transactionsWithCumulative
    }
    // Only show transactions that contribute to the top 80% of spending
    return transactionsWithCumulative.filter((tx) => tx.cumulative <= threshold80Percent)
  }, [transactionsWithCumulative, threshold80Percent, fullView])

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
    return `${currencySymbol}${valueInK.toFixed(1)}k`
  }

  // Category total for the selected period (YTD uses canonical dashboard-aligned logic)
  const selectedCategoryTotal = useMemo(() => {
    if (!selectedCategory) return null

    if (periodType === 'YTD') {
      const ytdMap = computeExpenseYtdByCategory(transactions, {
        year: selectedYear,
        asOf: defaultExpenseYtdAsOf(selectedYear),
        gbpUsdRate: fxRate,
        expenseOnly: true,
      })
      const gbp = expenseYtdMagnitude(ytdMap.get(selectedCategory) ?? 0)
      return currency === 'USD' ? convertAmount(gbp, 'GBP') : gbp
    }

    let total = 0
    transactions.forEach((tx) => {
      const rate = getRateForDate(typeof tx.date === 'string' ? tx.date : tx.date)
      const amount =
        currency === 'USD'
          ? (tx.amount_usd ?? (tx.amount_gbp != null ? tx.amount_gbp * rate : 0))
          : (tx.amount_gbp ?? (tx.amount_usd != null ? tx.amount_usd / rate : 0))
      total += Math.abs(amount)
    })
    return total
  }, [
    transactions,
    currency,
    convertAmount,
    fxRate,
    getRateForDate,
    periodType,
    selectedCategory,
    selectedYear,
  ])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="flex gap-4">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-40" />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><Skeleton className="h-4 w-32" /></TableHead>
                <TableHead><Skeleton className="h-4 w-24" /></TableHead>
                <TableHead><Skeleton className="h-4 w-24" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
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
        <CardHeader className="px-4 py-3 pb-4">
          <CardTitle className="text-base">Transaction Analysis</CardTitle>
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
    <Card ref={cardRef} className="">
      <CardHeader className="px-4 py-3 pb-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Transaction Analysis</CardTitle>
          <FullTableViewToggle
            fullView={fullView}
            onToggle={() => setFullView((v) => !v)}
            aria-label="Toggle full table view for Transaction Analysis"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Filters */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="period-type-select" className="text-sm font-medium">Period Type</label>
            <select
              id="period-type-select"
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as 'YTD' | 'MTD')}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <option value="YTD">YTD</option>
              <option value="MTD">MTD</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="year-select" className="text-sm font-medium">Year</label>
            <select
              id="year-select"
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          {periodType === 'MTD' && (
            <div className="flex flex-col gap-2">
              <label htmlFor="month-select" className="text-sm font-medium">Month</label>
              <select
                id="month-select"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                  <option key={month} value={month}>
                    {new Date(selectedYear, month - 1).toLocaleString('default', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label htmlFor="category-select" className="text-sm font-medium">Category</label>
            <select
              id="category-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:min-w-[200px]"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Category Totals Summary */}
        {selectedCategory && selectedCategoryTotal != null && (
          <div className="p-4 bg-muted/50 rounded-md">
            <p className="text-sm font-semibold">
              {selectedCategory} Total ({periodType === 'YTD' ? `${selectedYear} YTD` : `${new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long' })} ${selectedYear}`}):{' '}
              <span className="font-bold">{formatCurrency(selectedCategoryTotal)}</span>
            </p>
            {periodType === 'YTD' && currency === 'USD' && (
              <p className="mt-1 text-xs text-muted-foreground">
                YTD computed in GBP at current FX (matches dashboard).
              </p>
            )}
          </div>
        )}

        {/* Instructional text */}
        {!fullView && transactionsWithCumulative.length > 0 && (
          <div className="p-3 bg-blue-50 dark:bg-muted border border-blue-200 dark:border-blue-900 rounded-md">
            <p className="text-sm text-muted-foreground dark:text-muted-foreground">
              <span className="font-semibold">Showing top 80% of transactions.</span> Click <span className="font-medium">"Full table view"</span> above to see all transactions for the selected period and category.
            </p>
          </div>
        )}

        {/* Transactions — Mobile cards */}
        {displayedTransactions.length > 0 ? (
          <>
            <div className="md:hidden space-y-3">
              {displayedTransactions.map((tx, index) => {
                const percentage = (Math.abs(tx.amount) / totalSpend) * 100
                const cumulativePercentage = (tx.cumulative / totalSpend) * 100
                return (
                  <div
                    key={`${tx.counterpartyKey}-${index}`}
                    className={cn(
                      'rounded-lg border p-3 min-h-[44px]',
                      tx.isTop80Percent && 'bg-yellow-50 dark:bg-yellow-950/20'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{tx.counterparty}</div>
                        {tx.isTop80Percent && (
                          <span className="text-xs text-yellow-600 dark:text-yellow-400 font-semibold">Top 80%</span>
                        )}
                      </div>
                      <span className="font-semibold num text-sm shrink-0">{formatCurrency(tx.amount)}</span>
                    </div>
                    <div className="mt-2 pt-2 border-t text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-0">
                      <span>{tx.transactionCount} txns</span>
                      <span>Cumulative: {formatCurrency(tx.cumulative)}</span>
                      <span>{cumulativePercentage.toFixed(1)}% of total</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <FullTableViewWrapper
              fullView={fullView}
              onClose={() => setFullView(false)}
              className="hidden md:block relative max-h-[600px] overflow-auto border rounded-md"
            >
              <table className="w-full caption-bottom text-[13px] [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wider [&_th]:font-medium [&_th]:py-2 [&_td]:py-2">
                <TableHeader>
                  <TableRow className="border-b bg-muted">
                    <TableHead className="sticky left-0 top-0 z-30 bg-muted">Counterparty</TableHead>
                    <TableHead className="sticky top-0 z-20 text-right bg-muted">Amount</TableHead>
                    <TableHead className="sticky top-0 z-20 text-right bg-muted">Transactions</TableHead>
                    <TableHead className="sticky top-0 z-20 text-right bg-muted">Cumulative</TableHead>
                    <TableHead className="sticky top-0 z-20 text-right bg-muted">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedTransactions.map((tx, index) => {
                    const percentage = (Math.abs(tx.amount) / totalSpend) * 100
                    const cumulativePercentage = (tx.cumulative / totalSpend) * 100
                    
                    return (
                      <TableRow
                        key={`${tx.counterpartyKey}-${index}`}
                        className={cn(
                          tx.isTop80Percent && 'bg-yellow-50 dark:bg-yellow-950/20'
                        )}
                      >
                        <TableCell className="sticky left-0 z-20 bg-background font-medium">
                          {tx.counterparty}
                          {tx.isTop80Percent && (
                            <span className="ml-2 text-xs text-yellow-600 dark:text-yellow-400 font-semibold">
                              (Top 80%)
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium num">
                          {formatCurrency(tx.amount)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground num">
                          {tx.transactionCount}
                        </TableCell>
                        <TableCell className="text-right font-semibold num">
                          {formatCurrency(tx.cumulative)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground num">
                          {cumulativePercentage.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </table>
            </FullTableViewWrapper>
          </>
        ) : (
          <EmptyState
            icon={Receipt}
            title="No transactions found"
            description={`No transactions found for ${selectedCategory} in ${periodType === 'YTD' ? selectedYear : `${new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long' })} ${selectedYear}`}.`}
          />
        )}
      </CardContent>
    </Card>
  )
}
