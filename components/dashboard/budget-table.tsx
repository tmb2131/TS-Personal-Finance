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
import { ArrowUpDown, ArrowUp, ArrowDown, AlertCircle, Receipt, CheckCircle2, XCircle, TrendingUp, TrendingDown } from 'lucide-react'
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
    <div className="space-y-6">
      {/* Summary Table */}
      <BudgetSummaryTable incomeData={incomeData} expenseData={expenseData} />

      {/* Income Table */}
      <BudgetIncomeTable
        data={data}
        sortField={incomeSortField}
        sortDirection={incomeSortDirection}
        onSort={handleIncomeSort}
      />

      {/* Expenses Table */}
      <Card>
        <CardHeader className="bg-muted/50">
          <CardTitle>Expenses</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {/* Executive Summary Cards */}
          <div className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Expenses Status */}
              <div className="space-y-3 p-4 rounded-lg border-2 border-gray-700 bg-card">
                <div className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-orange-600" />
                  <h3 className="font-semibold text-sm uppercase tracking-wide">Expenses Status</h3>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">vs Budget</p>
                    {expenseTotals.gap >= 0 ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <p className="text-lg font-bold text-green-600">Under Budget</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <XCircle className="h-5 w-5 text-red-600" />
                        <p className="text-lg font-bold text-red-600">Over Budget</p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 pt-2 border-t">
                    <p className="text-sm">
                      <span className={cn('font-semibold', expenseTotals.gap >= 0 ? 'text-green-600' : 'text-red-600')}>
                        {formatCurrencyCompact(Math.abs(expenseTotals.gap))}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">
                        {expenseTotals.gap >= 0 ? 'under' : 'over'} target
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
                    <div className="pt-1 mt-1 border-t">
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

              {/* Top Categories Above Budget */}
              <div className="space-y-3 p-4 rounded-lg border bg-card">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-green-600" />
                  <h3 className="font-semibold text-sm uppercase tracking-wide">Top Categories Above Budget</h3>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Spending Less Than Budgeted</p>
                    {topCategories.aboveBudget.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <p className="text-lg font-bold text-green-600">Under Budget</p>
                      </div>
                    ) : (
                      <p className="text-lg font-bold text-muted-foreground">None</p>
                    )}
                  </div>
                  <div className="space-y-3 pt-2 border-t">
                    {topCategories.aboveBudget.length > 0 ? (
                      topCategories.aboveBudget.map((item) => {
                        const maxGap = Math.max(...topCategories.aboveBudget.map((i) => Math.abs(i.gap)), 1)
                        const pct = (Math.abs(item.gap) / maxGap) * 100
                        return (
                          <div key={item.category} className="flex items-center gap-2">
                            <span className="text-sm w-24 truncate">{item.category}</span>
                            <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
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

              {/* Top Categories Below Budget */}
              <div className="space-y-3 p-4 rounded-lg border bg-card">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-red-600" />
                  <h3 className="font-semibold text-sm uppercase tracking-wide">Top Categories Below Budget</h3>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Spending More Than Budgeted</p>
                    {topCategories.belowBudget.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <XCircle className="h-5 w-5 text-red-600" />
                        <p className="text-lg font-bold text-red-600">Over Budget</p>
                      </div>
                    ) : (
                      <p className="text-lg font-bold text-muted-foreground">None</p>
                    )}
                  </div>
                  <div className="space-y-3 pt-2 border-t">
                    {topCategories.belowBudget.length > 0 ? (
                      topCategories.belowBudget.map((item) => {
                        const maxGap = Math.max(...topCategories.belowBudget.map((i) => Math.abs(i.gap)), 1)
                        const pct = (Math.abs(item.gap) / maxGap) * 100
                        return (
                          <div key={item.category} className="flex items-center gap-2">
                            <span className="text-sm w-24 truncate">{item.category}</span>
                            <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
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
            </div>
          </div>
          {/* Table with sticky header (same structure as Annual Trends table) */}
          <div className="hidden md:block relative max-h-[600px] overflow-auto border rounded-md">
            <table className="w-full caption-bottom text-sm">
            <TableHeader>
                <TableRow className="border-b bg-muted">
                  <TableHead className="sticky top-0 z-20 bg-muted">
                    <button
                      onClick={() => handleExpenseSort('category')}
                      className="flex items-center hover:opacity-70 transition-opacity"
                    >
                      Expenses
                      <SortIcon field="category" currentField={expenseSortField} direction={expenseSortDirection} />
                    </button>
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 text-right bg-muted">
                    <button
                      onClick={() => handleExpenseSort('annualBudget')}
                      className="flex items-center justify-end ml-auto hover:opacity-70 transition-opacity"
                    >
                      Budget
                      <SortIcon field="annualBudget" currentField={expenseSortField} direction={expenseSortDirection} />
                    </button>
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 text-right bg-muted">
                    <button
                      onClick={() => handleExpenseSort('tracking')}
                      className="flex items-center justify-end ml-auto hover:opacity-70 transition-opacity"
                    >
                      Tracking
                      <SortIcon field="tracking" currentField={expenseSortField} direction={expenseSortDirection} />
                    </button>
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 text-right bg-muted">
                    <button
                      onClick={() => handleExpenseSort('ytd')}
                      className="flex items-center justify-end ml-auto hover:opacity-70 transition-opacity"
                    >
                      YTD
                      <SortIcon field="ytd" currentField={expenseSortField} direction={expenseSortDirection} />
                    </button>
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 text-right bg-muted">
                    <button
                      onClick={() => handleExpenseSort('gap')}
                      className="flex items-center justify-end ml-auto hover:opacity-70 transition-opacity"
                    >
                      Gap
                      <SortIcon field="gap" currentField={expenseSortField} direction={expenseSortDirection} />
                    </button>
                  </TableHead>
                  <TableHead className="sticky top-0 z-20 w-32 bg-muted"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
              {expenseData.map((row) => {
                // Recalculate gap to ensure it's correct: Gap = Tracking - Budget
                // Note: For expenses, if stored as negative, this will give the correct sign
                const gap = row.tracking - row.annualBudget
                const gapPercent = (Math.abs(gap) / maxGap) * 100
                // For expenses: positive gap (tracking > budget) means spending less than budgeted = good (green)
                // Negative gap (tracking < budget) means spending more than budgeted = bad (red)
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
                    <TableCell className="text-right">
                      {row.ytd === 0 ? '-' : `(${formatCurrencyCompact(Math.abs(row.ytd))})`}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-medium',
                        isPositive ? 'text-green-600' : 'text-red-600'
                      )}
                    >
                      {gap === 0 ? '-' : formatCurrencyCompact(gap)}
                    </TableCell>
                    <TableCell className="w-32">
                      <div className="relative h-6 w-full">
                        {gap !== 0 && (
                          <div
                            className={cn(
                              'absolute h-full',
                              isPositive
                                ? 'bg-green-500 right-0'
                                : 'bg-red-500 left-0'
                            )}
                            style={{
                              width: `${gapPercent}%`,
                            }}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
              {/* Totals Row */}
              <TableRow className="bg-muted/50 border-t-2">
                <TableCell className="font-semibold">Expenses</TableCell>
                <TableCell className="text-right font-semibold">
                  ({formatCurrencyCompact(expenseTotals.annualBudget)})
                </TableCell>
                <TableCell className="text-right font-semibold">
                  ({formatCurrencyCompact(expenseTotals.tracking)})
                </TableCell>
                <TableCell className="text-right font-semibold">
                  ({formatCurrencyCompact(expenseTotals.ytd)})
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right font-semibold',
                    expenseTotals.gap >= 0 ? 'text-green-600' : 'text-red-600'
                  )}
                >
                  {formatCurrencyCompact(expenseTotals.gap)}
                </TableCell>
                <TableCell className="w-32">
                  <div className="relative h-6 w-full">
                    {expenseTotals.gap !== 0 && (
                      <div
                        className={cn(
                          'absolute h-full',
                          expenseTotals.gap >= 0 ? 'bg-green-500 right-0' : 'bg-red-500 left-0'
                        )}
                        style={{
                          width: `${(Math.abs(expenseTotals.gap) / maxGap) * 100}%`,
                        }}
                      />
                    )}
                  </div>
                </TableCell>
              </TableRow>
              </TableBody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
