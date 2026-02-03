'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TransactionLog } from '@/lib/types'
import { fetchFxRatesUpTo, buildGetRateForDate } from '@/lib/utils/fx-rates'
import { useCurrency } from '@/lib/contexts/currency-context'
import { MonthlyCategoryTrendsChart } from './monthly-category-trends-chart'
import { MonthlyCategorySummary } from './monthly-category-summary'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const EXCLUDED_CATEGORIES = ['Income', 'Gift Money', 'Other Income', 'Excluded']

export function MonthlyCategoryTrendsSection() {
  const { currency, fxRate } = useCurrency()
  const [transactions, setTransactions] = useState<TransactionLog[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ratesByDate, setRatesByDate] = useState<Map<string, number>>(new Map())

  // Fetch available categories and transactions
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const supabase = createClient()

      // Get date range: last 13 months starting from last full month
      const today = new Date()
      const lastFullMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const endDate = new Date(today.getFullYear(), today.getMonth(), 0)
      endDate.setHours(23, 59, 59, 999)
      // Go back 12 months from last full month to get 13 months total
      // This gives us: lastFullMonth - 12 months = first month of the 13-month range
      const startDate = new Date(lastFullMonth.getFullYear(), lastFullMonth.getMonth() - 12, 1)
      startDate.setHours(0, 0, 0, 0)

      // Format dates as YYYY-MM-DD without timezone conversion to avoid shifting dates
      // Use local date components instead of toISOString() which converts to UTC
      const formatDateStr = (date: Date): string => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }

      const startDateStr = formatDateStr(startDate)
      const endDateStr = formatDateStr(endDate)

      // Ensure we're fetching from the very first day of the first month
      // The query uses .gte() which is inclusive, so startDateStr should capture all transactions from that date

      // Fetch transactions with pagination to get all records
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
          .gte('date', startDateStr)
          .lte('date', endDateStr)
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

        hasMore = pageTransactions.length === pageSize
        page++
      }

      // Fetch FX rates for the date range
      const rates = await fetchFxRatesUpTo(supabase, endDateStr)
      setRatesByDate(rates)

      setError(null)

      // Filter out excluded categories and get unique expense categories
      const expenseTransactions = (allTransactions || []).filter(
        (tx: TransactionLog) => !EXCLUDED_CATEGORIES.includes(tx.category || '')
      )

      const uniqueCategories = Array.from(
        new Set(expenseTransactions.map((tx: TransactionLog) => tx.category).filter(Boolean))
      ).sort() as string[]

      setCategories(uniqueCategories)
      setTransactions(expenseTransactions as TransactionLog[])

      setLoading(false)
    }

    fetchData()
  }, [currency])

  // Set default category when categories are loaded
  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0])
    }
  }, [categories, selectedCategory])

  // Rate for a given date
  const getRateForDate = useMemo(
    () => buildGetRateForDate(ratesByDate, fxRate),
    [ratesByDate, fxRate]
  )

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return null
  }

  return (
    <Card id="monthly-category-trends" className="scroll-mt-24">
      <CardHeader className="bg-muted/50 px-4 py-3 pb-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <CardTitle className="text-base">Monthly Trends by Category</CardTitle>
          {categories.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="category-select-combined" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                Category:
              </label>
              <select
                id="category-select-combined"
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
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {selectedCategory && (
          <MonthlyCategorySummary
            transactions={transactions}
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            getRateForDate={getRateForDate}
            hideCard={true}
          />
        )}
        <MonthlyCategoryTrendsChart
          transactions={transactions}
          selectedCategory={selectedCategory}
          getRateForDate={getRateForDate}
          hideCard={true}
        />
      </CardContent>
    </Card>
  )
}
