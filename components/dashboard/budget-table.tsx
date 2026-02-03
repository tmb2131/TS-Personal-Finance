'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
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
import { BudgetTarget } from '@/lib/types'
import { cn } from '@/utils/cn'
import { FullTableViewToggle } from '@/components/dashboard/full-table-view-toggle'
import { FullTableViewWrapper } from '@/components/dashboard/full-table-view-wrapper'
import { ArrowUpDown, ArrowUp, ArrowDown, AlertCircle, Receipt, CheckCircle2, XCircle, TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BudgetSummaryTable } from './budget-summary-table'
import { BudgetIncomeTable } from './budget-income-table'

type SortField = 'category' | 'annualBudget' | 'tracking' | 'ytd' | 'gap'
type SortDirection = 'asc' | 'desc' | null

interface BudgetTableProps {
  initialData?: BudgetTarget[]
}

export function BudgetTable({ initialData }: BudgetTableProps = {}) {
  const { currency, fxRate, convertAmount } = useCurrency()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)
  const [expenseSortField, setExpenseSortField] = useState<SortField>('gap')
  const [expenseSortDirection, setExpenseSortDirection] = useState<SortDirection>('desc')
  const [incomeSortField, setIncomeSortField] = useState<SortField>('category')
  const [incomeSortDirection, setIncomeSortDirection] = useState<SortDirection>('asc')
  const [expensesExpanded, setExpensesExpanded] = useState(false)
  const [expenseFullView, setExpenseFullView] = useState(false)
  const [historyForecastSpend, setHistoryForecastSpend] = useState<{
    dayAgo: Record<string, number>
    weekAgo: Record<string, number>
    monthAgo: Record<string, number>
  }>({ dayAgo: {}, weekAgo: {}, monthAgo: {} })

  // Process data: always use GBP from data; convert to USD with current FX when currency is USD (matches Key Insights)
  const processData = useCallback(
    (budgets: BudgetTarget[]) => {
      return budgets.map((budget) => {
        const annualBudget =
          currency === 'USD'
            ? convertAmount(budget.annual_budget_gbp, 'GBP', fxRate)
            : budget.annual_budget_gbp
        const tracking =
          currency === 'USD'
            ? convertAmount(budget.tracking_est_gbp, 'GBP', fxRate)
            : budget.tracking_est_gbp
        const ytd =
          currency === 'USD'
            ? convertAmount(budget.ytd_gbp, 'GBP', fxRate)
            : budget.ytd_gbp

        // Gap = Tracking - Budget (for all categories)
        const gap = tracking - annualBudget

        return {
          category: budget.category,
          annualBudget,
          tracking,
          ytd,
          gap,
        }
      })
    },
    [currency, fxRate, convertAmount]
  )

  useEffect(() => {
    // If we have initial data, reprocess it when currency changes
    if (initialData) {
      const joined = processData(initialData)
      setData(joined)
      setLoading(false)
      return
    }

    // Otherwise fetch fresh data
    async function fetchData() {
      setLoading(true)
      const supabase = createClient()
      
      const budgetsResult = await supabase.from('budget_targets').select('*')

      if (budgetsResult.error) {
        console.error('Error fetching budget data:', budgetsResult.error)
        setError('Failed to load budget data. Please try refreshing the page.')
        setLoading(false)
        return
      }
      
      setError(null)

      const budgets = budgetsResult.data as BudgetTarget[]
      const joined = processData(budgets)
      setData(joined)
      setLoading(false)
    }

    fetchData()
  }, [currency, initialData, processData])

  // Fetch budget_history for 1d / 1w / 1mo ago for forecast evolution columns in full view.
  // Use latest snapshot on or before each target date (snapshots only exist when sync/cron ran).
  // Refetch when full view opens so we run after auth is ready and get fresh data.
  useEffect(() => {
    if (!expenseFullView) return

    const EXCLUDED = ['Income', 'Gift Money', 'Other Income', 'Excluded']
    const toNum = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)
    const toDateStr = (d: Date) => d.toISOString().split('T')[0]
    const normalizeDate = (v: unknown) => (typeof v === 'string' ? v.split('T')[0] : String(v).split('T')[0])

    async function fetchHistory() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const today = new Date()
      const weekAgoStr = toDateStr(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000))
      const monthAgoStr = toDateStr(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000))
      const monthAgoDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

      // Fetch all snapshots in the last 30 days; we'll pick the latest on or before each target
      const { data: rows, error } = await supabase
        .from('budget_history')
        .select('category, annual_budget, forecast_spend, date')
        .eq('user_id', user.id)
        .gte('date', toDateStr(monthAgoDate))
        .lte('date', toDateStr(today))

      if (error || !rows?.length) {
        setHistoryForecastSpend({ dayAgo: {}, weekAgo: {}, monthAgo: {} })
        return
      }

      const byDate = new Map<string, { category: string; annual_budget: unknown; forecast_spend: unknown }[]>()
      for (const r of rows as { category: string; annual_budget: unknown; forecast_spend: unknown; date: unknown }[]) {
        const d = normalizeDate(r.date)
        if (!byDate.has(d)) byDate.set(d, [])
        byDate.get(d)!.push({ category: r.category, annual_budget: r.annual_budget, forecast_spend: r.forecast_spend })
      }
      const sortedDates = Array.from(byDate.keys()).sort()
      const todayStr = toDateStr(today)

      const latestOnOrBefore = (target: string) => {
        const idx = sortedDates.findIndex((d) => d > target)
        if (idx === 0) return null
        if (idx === -1) return sortedDates[sortedDates.length - 1]
        return sortedDates[idx - 1]
      }

      // "1 day ago" must use a snapshot strictly before today (never today's snapshot)
      const datesBeforeToday = sortedDates.filter((d) => d < todayStr)
      const dayAgoDate = datesBeforeToday.length > 0 ? datesBeforeToday[datesBeforeToday.length - 1] : null

      // Store forecast_spend (tracking) per category for each date — used to show change in gap (current Tracking − historical forecast_spend)
      const buildForecastMap = (dateKey: string | null) => {
        const map: Record<string, number> = {}
        if (!dateKey) return map
        const list = byDate.get(dateKey) ?? []
        list.filter((r) => !EXCLUDED.includes(r.category)).forEach((r) => {
          map[r.category] = toNum(r.forecast_spend)
        })
        return map
      }

      setHistoryForecastSpend({
        dayAgo: buildForecastMap(dayAgoDate),
        weekAgo: buildForecastMap(latestOnOrBefore(weekAgoStr)),
        monthAgo: buildForecastMap(latestOnOrBefore(monthAgoStr)),
      })
    }
    fetchHistory()
  }, [expenseFullView])

  // Derive display data so we show initialData on first paint (avoids flash of empty before useEffect runs)
  const displayData = useMemo(
    () => (data.length ? data : (initialData?.length ? processData(initialData) : [])),
    [data, initialData, processData]
  )

  // Separate income and expense data
  const incomeData = useMemo(() => {
    return displayData.filter(
      (row) => row.category === 'Income' || row.category === 'Gift Money'
    )
  }, [displayData])

  // Filter and sort expense data
  const expenseData = useMemo(() => {
    // Filter out income categories and categories with budget = 0, YTD = 0, and gap = 0
    const filtered = displayData.filter(
      (row) =>
        row.category !== 'Income' &&
        row.category !== 'Gift Money' &&
        (row.annualBudget !== 0 || row.ytd !== 0 || row.gap !== 0)
    )

    // Sort data
    const sorted = [...filtered].sort((a, b) => {
      if (!expenseSortDirection) return 0

      let aValue: number | string = a[expenseSortField]
      let bValue: number | string = b[expenseSortField]

      // Handle string comparison for category
      if (expenseSortField === 'category') {
        aValue = (aValue as string).toLowerCase()
        bValue = (bValue as string).toLowerCase()
      }

      if (aValue < bValue) return expenseSortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return expenseSortDirection === 'asc' ? 1 : -1
      return 0
    })

    return sorted
  }, [displayData, expenseSortField, expenseSortDirection])

  // Calculate expense totals
  const expenseTotals = useMemo(() => {
    // For expenses, values are stored as negative, so we need to preserve the sign
    // when calculating totals, then convert to positive for display
    const sum = expenseData.reduce(
      (acc, row) => ({
        annualBudget: acc.annualBudget + row.annualBudget, // Keep original sign
        tracking: acc.tracking + row.tracking, // Keep original sign
        ytd: acc.ytd + row.ytd, // Keep original sign
      }),
      { annualBudget: 0, tracking: 0, ytd: 0 }
    )
    // Calculate gap from totals: Gap = Tracking - Budget
    // For expenses (negative values): if tracking = -192.5K and budget = -205.4K
    // Gap = -192.5K - (-205.4K) = -192.5K + 205.4K = +12.9K (spending less = good)
    const gap = sum.tracking - sum.annualBudget
    
    return {
      annualBudget: Math.abs(sum.annualBudget), // Convert to positive for display
      tracking: Math.abs(sum.tracking), // Convert to positive for display
      ytd: Math.abs(sum.ytd), // Convert to positive for display
      gap: gap, // Gap is already correct (positive = spending less than budgeted)
    }
  }, [expenseData])

  // Find max absolute gap for bar chart scaling
  const maxGap = useMemo(() => {
    if (expenseData.length === 0) return 1
    const gaps = expenseData.map((row) => Math.abs(row.tracking - row.annualBudget))
    return Math.max(...gaps, Math.abs(expenseTotals.gap))
  }, [expenseData, expenseTotals.gap])

  // Split expense rows for two-column compact table (no scroll)
  const expenseMid = Math.ceil(expenseData.length / 2)
  const expenseLeftRows = expenseData.slice(0, expenseMid)
  const expenseRightRows = expenseData.slice(expenseMid)
  const expenseCompactClass = '[&_th]:h-8 [&_th]:px-2 [&_th]:py-1 [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wider [&_th]:font-medium [&_td]:h-8 [&_td]:px-2 [&_td]:py-1 [&_td]:text-[13px] [&_td]:tabular-nums'

  // Calculate top categories above/below budget
  const topCategories = useMemo(() => {
    const categoriesWithGaps = expenseData.map((row) => {
      const gap = row.tracking - row.annualBudget
      return {
        category: row.category,
        gap: gap,
        gapAbs: Math.abs(gap),
      }
    })

    // Top categories above budget (positive gap = spending less = good)
    const aboveBudget = [...categoriesWithGaps]
      .filter((c) => c.gap > 0)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 3)

    // Top categories below budget (negative gap = spending more = bad)
    const belowBudget = [...categoriesWithGaps]
      .filter((c) => c.gap < 0)
      .sort((a, b) => a.gap - b.gap) // Most negative first
      .slice(0, 3)

    return {
      aboveBudget,
      belowBudget,
    }
  }, [expenseData])

  // Shared scale for executive summary cards (above + below budget)
  const maxGapCards = useMemo(() => {
    const above = topCategories.aboveBudget.map((i) => Math.abs(i.gap))
    const below = topCategories.belowBudget.map((i) => Math.abs(i.gap))
    return Math.max(...above, ...below, 1)
  }, [topCategories])

  const handleExpenseSort = (field: SortField) => {
    if (expenseSortField === field) {
      setExpenseSortDirection(expenseSortDirection === 'desc' ? 'asc' : 'desc')
    } else {
      setExpenseSortField(field)
      setExpenseSortDirection('desc')
    }
  }

  const handleIncomeSort = (field: SortField) => {
    if (incomeSortField === field) {
      setIncomeSortDirection(incomeSortDirection === 'desc' ? 'asc' : 'desc')
    } else {
      setIncomeSortField(field)
      setIncomeSortDirection('asc')
    }
  }

  const SortIcon = ({ field, currentField, direction }: { field: SortField; currentField: SortField; direction: SortDirection }) => {
    if (currentField !== field) {
      return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
    }
    if (direction === 'asc') {
      return <ArrowUp className="ml-2 h-4 w-4" />
    }
    return <ArrowDown className="ml-2 h-4 w-4" />
  }

  const formatCurrencyCompact = (value: number) => {
    // Always format as £0.0K (divide by 1000, show 1 decimal place)
    const valueInK = value / 1000
    const currencySymbol = currency === 'USD' ? '$' : '£'
    return `${currencySymbol}${valueInK.toFixed(1)}K`
  }

  const formatCurrencyLarge = (value: number) => {
    const valueInM = Math.abs(value) / 1000000
    const currencySymbol = currency === 'USD' ? '$' : '£'
    if (valueInM >= 1) {
      return `${currencySymbol}${valueInM.toFixed(1)}M`
    }
    return formatCurrencyCompact(value)
  }

  const formatPercentAbs = (value: number) => {
    const absValue = Math.abs(value)
    if (absValue < 0.1) {
      return '<0.1%'
    }
    return `${absValue.toFixed(1)}%`
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Summary Table Skeleton */}
        <Card>
          <CardHeader className="bg-muted/50">
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><Skeleton className="h-4 w-24" /></TableHead>
                  <TableHead><Skeleton className="h-4 w-20" /></TableHead>
                  <TableHead><Skeleton className="h-4 w-20" /></TableHead>
                  <TableHead><Skeleton className="h-4 w-16" /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3, 4].map((i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Income Table Skeleton */}
        <Card>
          <CardHeader className="bg-muted/50">
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><Skeleton className="h-4 w-24" /></TableHead>
                  <TableHead><Skeleton className="h-4 w-20" /></TableHead>
                  <TableHead><Skeleton className="h-4 w-20" /></TableHead>
                  <TableHead><Skeleton className="h-4 w-16" /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3].map((i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Expenses Table Skeleton */}
        <Card>
          <CardHeader className="bg-muted/50">
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><Skeleton className="h-4 w-24" /></TableHead>
                  <TableHead><Skeleton className="h-4 w-20" /></TableHead>
                  <TableHead><Skeleton className="h-4 w-20" /></TableHead>
                  <TableHead><Skeleton className="h-4 w-16" /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3, 4, 5].map((i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <CardTitle>Budget Tracker</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={AlertCircle}
            title="Error loading budget data"
            description={error}
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {/* Summary Table */}
      <BudgetSummaryTable incomeData={incomeData} expenseData={expenseData} />

      {/* Income Table */}
      <BudgetIncomeTable
        data={data}
        sortField={incomeSortField}
        sortDirection={incomeSortDirection}
        onSort={handleIncomeSort}
      />

      {/* Expenses Table - on mobile collapsed by default, expand with "Show expenses breakdown" */}
      <Card>
        <CardHeader className="bg-muted/50 px-4 py-3 pb-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">Expenses</CardTitle>
            <div className="flex items-center gap-2">
              <FullTableViewToggle
                fullView={expenseFullView}
                onToggle={() => setExpenseFullView((v) => !v)}
                aria-label="Toggle full table view for Expenses"
              />
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden shrink-0"
                onClick={() => setExpensesExpanded((v) => !v)}
              >
                {expensesExpanded ? (
                  <>
                    <ChevronUp className="h-4 w-4 mr-1" />
                    Hide
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-1" />
                    Show breakdown
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {/* Executive Summary Cards — always visible */}
          <div className="mb-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {/* Expenses Status */}
              <div className="space-y-2 p-3 rounded-lg border bg-card">
                <div className="flex items-center gap-1.5">
                  <Receipt className="h-4 w-4 text-orange-600" />
                  <h3 className="font-semibold text-xs uppercase tracking-wide">Expenses Status</h3>
                </div>
                <div className="space-y-1">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">vs Budget</p>
                    {expenseTotals.gap >= 0 ? (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <p className="text-base font-bold text-green-600">Under Budget</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <XCircle className="h-4 w-4 text-red-600" />
                        <p className="text-base font-bold text-red-600">Over Budget</p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-0.5 pt-1.5 border-t">
                    <p className="text-sm">
                      <span className={cn('font-semibold', expenseTotals.gap >= 0 ? 'text-green-600' : 'text-red-600')}>
                        {formatCurrencyCompact(Math.abs(expenseTotals.gap))}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">
                        {expenseTotals.gap >= 0 ? 'under' : 'over'} budget
                      </span>
                    </p>
                    <p className="text-xs">
                      <span className={`font-medium ${expenseTotals.gap >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPercentAbs(expenseTotals.annualBudget !== 0 ? ((Math.abs(expenseTotals.gap) / expenseTotals.annualBudget) * 100) : 0)}
                      </span>
                      <span className="text-muted-foreground ml-1">
                        {expenseTotals.gap >= 0 ? 'under' : 'over'} budget
                      </span>
                    </p>
                    <div className="pt-0.5 mt-0.5 border-t">
                      <p className="text-xs text-muted-foreground">
                        Expenses Tracking: <span className="font-medium">{formatCurrencyLarge(expenseTotals.tracking)}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Expenses Budget: <span className="font-medium">{formatCurrencyLarge(expenseTotals.annualBudget)}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Order: card to the right of Status explains the net change (Under → Above Budget first; Over → Below Budget first) */}
              {expenseTotals.gap >= 0 ? (
                <>
                  {/* Top Categories Above Budget (Spending Less) */}
                  <div className="space-y-2 p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-1.5">
                      <TrendingDown className="h-4 w-4 text-green-600" />
                      <h3 className="font-semibold text-xs uppercase tracking-wide">Top Categories Above Budget</h3>
                    </div>
                    <div className="space-y-1">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Spending Less Than Budgeted</p>
                        {topCategories.aboveBudget.length > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            <p className="text-base font-bold text-green-600">Under Budget</p>
                          </div>
                        ) : (
                          <p className="text-base font-bold text-muted-foreground">None</p>
                        )}
                      </div>
                      <div className="space-y-2 pt-1.5 border-t">
                        {topCategories.aboveBudget.length > 0 ? (
                          topCategories.aboveBudget.map((item) => {
                            const pct = (Math.abs(item.gap) / maxGapCards) * 100
                            return (
                              <div key={item.category} className="flex items-center gap-1.5">
                                <span className="text-xs w-20 truncate">{item.category}</span>
                                <div className="flex-1 h-3 rounded bg-muted overflow-hidden">
                                  <div className="h-full bg-green-500 rounded" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-xs font-medium text-green-600 w-14 text-right">{formatCurrencyCompact(item.gap)}</span>
                              </div>
                            )
                          })
                        ) : (
                          <p className="text-xs text-muted-foreground">No categories above budget</p>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Top Categories Below Budget (Spending More) */}
                  <div className="space-y-2 p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-4 w-4 text-red-600" />
                      <h3 className="font-semibold text-xs uppercase tracking-wide">Top Categories Below Budget</h3>
                    </div>
                    <div className="space-y-1">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Spending More Than Budgeted</p>
                        {topCategories.belowBudget.length > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <XCircle className="h-4 w-4 text-red-600" />
                            <p className="text-base font-bold text-red-600">Over Budget</p>
                          </div>
                        ) : (
                          <p className="text-base font-bold text-muted-foreground">None</p>
                        )}
                      </div>
                      <div className="space-y-2 pt-1.5 border-t">
                        {topCategories.belowBudget.length > 0 ? (
                          topCategories.belowBudget.map((item) => {
                            const pct = (Math.abs(item.gap) / maxGapCards) * 100
                            return (
                              <div key={item.category} className="flex items-center gap-1.5">
                                <span className="text-xs w-20 truncate">{item.category}</span>
                                <div className="flex-1 h-3 rounded bg-muted overflow-hidden">
                                  <div className="h-full bg-red-500 rounded" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-xs font-medium text-red-600 w-14 text-right">{formatCurrencyCompact(Math.abs(item.gap))}</span>
                              </div>
                            )
                          })
                        ) : (
                          <p className="text-xs text-muted-foreground">No categories below budget</p>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Top Categories Below Budget (Spending More) — first when Over Budget */}
                  <div className="space-y-2 p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-4 w-4 text-red-600" />
                      <h3 className="font-semibold text-xs uppercase tracking-wide">Top Categories Below Budget</h3>
                    </div>
                    <div className="space-y-1">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Spending More Than Budgeted</p>
                        {topCategories.belowBudget.length > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <XCircle className="h-4 w-4 text-red-600" />
                            <p className="text-base font-bold text-red-600">Over Budget</p>
                          </div>
                        ) : (
                          <p className="text-base font-bold text-muted-foreground">None</p>
                        )}
                      </div>
                      <div className="space-y-2 pt-1.5 border-t">
                        {topCategories.belowBudget.length > 0 ? (
                          topCategories.belowBudget.map((item) => {
                            const pct = (Math.abs(item.gap) / maxGapCards) * 100
                            return (
                              <div key={item.category} className="flex items-center gap-1.5">
                                <span className="text-xs w-20 truncate">{item.category}</span>
                                <div className="flex-1 h-3 rounded bg-muted overflow-hidden">
                                  <div className="h-full bg-red-500 rounded" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-xs font-medium text-red-600 w-14 text-right">{formatCurrencyCompact(Math.abs(item.gap))}</span>
                              </div>
                            )
                          })
                        ) : (
                          <p className="text-xs text-muted-foreground">No categories below budget</p>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Top Categories Above Budget (Spending Less) */}
                  <div className="space-y-2 p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-1.5">
                      <TrendingDown className="h-4 w-4 text-green-600" />
                      <h3 className="font-semibold text-xs uppercase tracking-wide">Top Categories Above Budget</h3>
                    </div>
                    <div className="space-y-1">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Spending Less Than Budgeted</p>
                        {topCategories.aboveBudget.length > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            <p className="text-base font-bold text-green-600">Under Budget</p>
                          </div>
                        ) : (
                          <p className="text-base font-bold text-muted-foreground">None</p>
                        )}
                      </div>
                      <div className="space-y-2 pt-1.5 border-t">
                        {topCategories.aboveBudget.length > 0 ? (
                          topCategories.aboveBudget.map((item) => {
                            const pct = (Math.abs(item.gap) / maxGapCards) * 100
                            return (
                              <div key={item.category} className="flex items-center gap-1.5">
                                <span className="text-xs w-20 truncate">{item.category}</span>
                                <div className="flex-1 h-3 rounded bg-muted overflow-hidden">
                                  <div className="h-full bg-green-500 rounded" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-xs font-medium text-green-600 w-14 text-right">{formatCurrencyCompact(item.gap)}</span>
                              </div>
                            )
                          })
                        ) : (
                          <p className="text-xs text-muted-foreground">No categories above budget</p>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          {/* Expenses — Mobile category cards (Hide/Show breakdown only toggles this block on mobile) */}
          <div className={cn('md:hidden space-y-3', !expensesExpanded && 'max-md:hidden')}>
            {expenseData.map((row) => {
              const gap = row.tracking - row.annualBudget
              const isPositive = gap >= 0
              return (
                <div
                  key={row.category}
                  className="rounded-lg border p-3 min-h-[44px]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-sm truncate">{row.category}</div>
                    <span
                      className={cn(
                        'font-semibold tabular-nums text-sm shrink-0',
                        isPositive ? 'text-green-600' : 'text-red-600'
                      )}
                    >
                      {gap === 0 ? '–' : formatCurrencyCompact(gap)}
                    </span>
                  </div>
                  <div className="mt-2 pt-2 border-t text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-0">
                    <span>Budget: {formatCurrencyCompact(Math.abs(row.annualBudget))}</span>
                    <span>Tracking: {formatCurrencyCompact(Math.abs(row.tracking))}</span>
                  </div>
                </div>
              )
            })}
          </div>
          {/* Expenses table: two side-by-side columns (desktop); full view = single table so header doesn't repeat */}
          <FullTableViewWrapper
            fullView={expenseFullView}
            onClose={() => setExpenseFullView(false)}
            className="hidden md:grid grid-cols-1 lg:grid-cols-2 gap-3"
          >
            {expenseFullView ? (
              <div className="border rounded-md overflow-hidden min-w-0">
                <Table className={expenseCompactClass}>
                  <TableHeader>
                    <TableRow className="border-b bg-muted">
                      <TableHead className={cn('bg-muted', expenseSortField === 'category' && 'bg-gray-200 dark:bg-gray-700')}>
                        <button
                          onClick={() => handleExpenseSort('category')}
                          className={cn('flex items-center hover:opacity-70 transition-opacity', expenseSortField === 'category' && 'font-semibold')}
                        >
                          Expenses
                          <SortIcon field="category" currentField={expenseSortField} direction={expenseSortDirection} />
                        </button>
                      </TableHead>
                      <TableHead className={cn('text-right bg-muted', expenseSortField === 'annualBudget' && 'bg-gray-200 dark:bg-gray-700')}>
                        <button
                          onClick={() => handleExpenseSort('annualBudget')}
                          className={cn('flex items-center justify-end ml-auto hover:opacity-70 transition-opacity', expenseSortField === 'annualBudget' && 'font-semibold')}
                        >
                          Budget
                          <SortIcon field="annualBudget" currentField={expenseSortField} direction={expenseSortDirection} />
                        </button>
                      </TableHead>
                      <TableHead className={cn('text-right bg-muted', expenseSortField === 'tracking' && 'bg-gray-200 dark:bg-gray-700')}>
                        <button
                          onClick={() => handleExpenseSort('tracking')}
                          className={cn('flex items-center justify-end ml-auto hover:opacity-70 transition-opacity', expenseSortField === 'tracking' && 'font-semibold')}
                        >
                          Tracking
                          <SortIcon field="tracking" currentField={expenseSortField} direction={expenseSortDirection} />
                        </button>
                      </TableHead>
                        <TableHead className={cn('text-right bg-muted', expenseSortField === 'gap' && 'bg-gray-200 dark:bg-gray-700')}>
                        <button
                          onClick={() => handleExpenseSort('gap')}
                          className={cn('flex items-center justify-end ml-auto hover:opacity-70 transition-opacity', expenseSortField === 'gap' && 'font-semibold')}
                        >
                          Gap
                          <SortIcon field="gap" currentField={expenseSortField} direction={expenseSortDirection} />
                        </button>
                      </TableHead>
                      <TableHead className="w-16 bg-muted"></TableHead>
                      <TableHead className="text-right bg-muted whitespace-nowrap">1 day ago</TableHead>
                      <TableHead className="text-right bg-muted whitespace-nowrap">1 week ago</TableHead>
                      <TableHead className="text-right bg-muted whitespace-nowrap">1 month ago</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenseData.map((row) => {
                      const gap = row.tracking - row.annualBudget
                      const gapPercent = (Math.abs(gap) / maxGap) * 100
                      const isPositive = gap >= 0
                      const forecastDay = historyForecastSpend.dayAgo[row.category]
                      const forecastWeek = historyForecastSpend.weekAgo[row.category]
                      const forecastMonth = historyForecastSpend.monthAgo[row.category]
                      const changeInGap = (historicalForecastGbp: number | undefined) => {
                        if (historicalForecastGbp === undefined) return undefined
                        const historicalInDisplayCurrency = currency === 'USD' ? convertAmount(historicalForecastGbp, 'GBP', fxRate) : historicalForecastGbp
                        return row.tracking - historicalInDisplayCurrency
                      }
                      const renderChangeInGap = (delta: number | undefined) => {
                        if (delta === undefined || delta === 0) return '–'
                        const pos = delta >= 0
                        return (
                          <span className={cn('font-medium', pos ? 'text-green-600' : 'text-red-600')}>
                            {formatCurrencyCompact(delta)}
                          </span>
                        )
                      }
                      return (
                        <TableRow key={row.category}>
                          <TableCell className="font-medium">{row.category}</TableCell>
                          <TableCell className="text-right">
                            ({formatCurrencyCompact(Math.abs(row.annualBudget))})
                          </TableCell>
                          <TableCell className="text-right">
                            ({formatCurrencyCompact(Math.abs(row.tracking))})
                          </TableCell>
                          <TableCell
                            className={cn(
                              'text-right font-medium',
                              isPositive ? 'text-green-600' : 'text-red-600'
                            )}
                          >
                            {gap === 0 ? '-' : formatCurrencyCompact(gap)}
                          </TableCell>
                          <TableCell className="w-16">
                            <div className="relative h-2 w-10">
                              {gap !== 0 && (
                                <div
                                  className={cn(
                                    'absolute h-full',
                                    isPositive ? 'bg-green-500 right-0' : 'bg-red-500 left-0'
                                  )}
                                  style={{ width: `${gapPercent}%` }}
                                />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{renderChangeInGap(changeInGap(forecastDay))}</TableCell>
                          <TableCell className="text-right">{renderChangeInGap(changeInGap(forecastWeek))}</TableCell>
                          <TableCell className="text-right">{renderChangeInGap(changeInGap(forecastMonth))}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <>
                <div className="border rounded-md overflow-hidden min-w-0">
                  <Table className={expenseCompactClass}>
                    <TableHeader>
                      <TableRow className="border-b bg-muted">
                        <TableHead className={cn('bg-muted', expenseSortField === 'category' && 'bg-gray-200 dark:bg-gray-700')}>
                          <button
                            onClick={() => handleExpenseSort('category')}
                            className={cn('flex items-center hover:opacity-70 transition-opacity', expenseSortField === 'category' && 'font-semibold')}
                          >
                            Expenses
                            <SortIcon field="category" currentField={expenseSortField} direction={expenseSortDirection} />
                          </button>
                        </TableHead>
                        <TableHead className={cn('text-right bg-muted', expenseSortField === 'annualBudget' && 'bg-gray-200 dark:bg-gray-700')}>
                          <button
                            onClick={() => handleExpenseSort('annualBudget')}
                            className={cn('flex items-center justify-end ml-auto hover:opacity-70 transition-opacity', expenseSortField === 'annualBudget' && 'font-semibold')}
                          >
                            Budget
                            <SortIcon field="annualBudget" currentField={expenseSortField} direction={expenseSortDirection} />
                          </button>
                        </TableHead>
                        <TableHead className={cn('text-right bg-muted', expenseSortField === 'tracking' && 'bg-gray-200 dark:bg-gray-700')}>
                          <button
                            onClick={() => handleExpenseSort('tracking')}
                            className={cn('flex items-center justify-end ml-auto hover:opacity-70 transition-opacity', expenseSortField === 'tracking' && 'font-semibold')}
                          >
                            Tracking
                            <SortIcon field="tracking" currentField={expenseSortField} direction={expenseSortDirection} />
                          </button>
                        </TableHead>
                        <TableHead className={cn('text-right bg-muted', expenseSortField === 'gap' && 'bg-gray-200 dark:bg-gray-700')}>
                          <button
                            onClick={() => handleExpenseSort('gap')}
                            className={cn('flex items-center justify-end ml-auto hover:opacity-70 transition-opacity', expenseSortField === 'gap' && 'font-semibold')}
                          >
                            Gap
                            <SortIcon field="gap" currentField={expenseSortField} direction={expenseSortDirection} />
                          </button>
                        </TableHead>
                        <TableHead className="w-16 bg-muted"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenseLeftRows.map((row) => {
                        const gap = row.tracking - row.annualBudget
                        const gapPercent = (Math.abs(gap) / maxGap) * 100
                        const isPositive = gap >= 0
                        return (
                          <TableRow key={row.category}>
                            <TableCell className="font-medium">{row.category}</TableCell>
                            <TableCell className="text-right">
                              ({formatCurrencyCompact(Math.abs(row.annualBudget))})
                            </TableCell>
                            <TableCell className="text-right">
                              ({formatCurrencyCompact(Math.abs(row.tracking))})
                            </TableCell>
                            <TableCell
                              className={cn(
                                'text-right font-medium',
                                isPositive ? 'text-green-600' : 'text-red-600'
                              )}
                            >
                              {gap === 0 ? '-' : formatCurrencyCompact(gap)}
                            </TableCell>
                            <TableCell className="w-16">
                              <div className="relative h-2 w-10">
                                {gap !== 0 && (
                                  <div
                                    className={cn(
                                      'absolute h-full',
                                      isPositive ? 'bg-green-500 right-0' : 'bg-red-500 left-0'
                                    )}
                                    style={{ width: `${gapPercent}%` }}
                                  />
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="border rounded-md overflow-hidden min-w-0">
                  <Table className={expenseCompactClass}>
                    <TableHeader>
                      <TableRow className="border-b bg-muted">
                        <TableHead className="bg-muted">Expenses</TableHead>
                        <TableHead className="text-right bg-muted">Budget</TableHead>
                        <TableHead className="text-right bg-muted">Tracking</TableHead>
                        <TableHead className="text-right bg-muted">Gap</TableHead>
                        <TableHead className="w-16 bg-muted"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenseRightRows.map((row) => {
                        const gap = row.tracking - row.annualBudget
                        const gapPercent = (Math.abs(gap) / maxGap) * 100
                        const isPositive = gap >= 0
                        return (
                          <TableRow key={row.category}>
                            <TableCell className="font-medium">{row.category}</TableCell>
                            <TableCell className="text-right">
                              ({formatCurrencyCompact(Math.abs(row.annualBudget))})
                            </TableCell>
                            <TableCell className="text-right">
                              ({formatCurrencyCompact(Math.abs(row.tracking))})
                            </TableCell>
                            <TableCell
                              className={cn(
                                'text-right font-medium',
                                isPositive ? 'text-green-600' : 'text-red-600'
                              )}
                            >
                              {gap === 0 ? '-' : formatCurrencyCompact(gap)}
                            </TableCell>
                            <TableCell className="w-16">
                              <div className="relative h-2 w-10">
                                {gap !== 0 && (
                                  <div
                                    className={cn(
                                      'absolute h-full',
                                      isPositive ? 'bg-green-500 right-0' : 'bg-red-500 left-0'
                                    )}
                                    style={{ width: `${gapPercent}%` }}
                                  />
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </FullTableViewWrapper>
        </CardContent>
      </Card>
    </div>
  )
}
