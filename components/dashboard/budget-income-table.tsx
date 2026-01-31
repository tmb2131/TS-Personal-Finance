'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCurrency } from '@/lib/contexts/currency-context'
import { cn } from '@/utils/cn'
import { ArrowUpDown, ArrowUp, ArrowDown, DollarSign, CheckCircle2, XCircle, TrendingUp, TrendingDown } from 'lucide-react'

type SortField = 'category' | 'annualBudget' | 'tracking' | 'ytd' | 'gap'
type SortDirection = 'asc' | 'desc' | null

interface BudgetIncomeTableProps {
  data: any[]
  sortField: SortField
  sortDirection: SortDirection
  onSort: (field: SortField) => void
}

export function BudgetIncomeTable({
  data,
  sortField,
  sortDirection,
  onSort,
}: BudgetIncomeTableProps) {
  const { currency } = useCurrency()

  // Filter to only income categories
  const incomeCategories = useMemo(() => {
    return data.filter((row) => 
      row.category === 'Income' || row.category === 'Gift Money'
    )
  }, [data])

  // Sort data
  const sortedData = useMemo(() => {
    return [...incomeCategories].sort((a, b) => {
      if (!sortDirection) return 0

      let aValue: number | string = a[sortField]
      let bValue: number | string = b[sortField]

      if (sortField === 'category') {
        aValue = (aValue as string).toLowerCase()
        bValue = (bValue as string).toLowerCase()
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [incomeCategories, sortField, sortDirection])

  // Calculate totals
  const totals = useMemo(() => {
    const sum = sortedData.reduce(
      (acc, row) => ({
        annualBudget: acc.annualBudget + row.annualBudget,
        tracking: acc.tracking + row.tracking,
        ytd: acc.ytd + row.ytd,
      }),
      { annualBudget: 0, tracking: 0, ytd: 0 }
    )
    // Calculate gap from totals: Gap = Tracking - Budget
    return {
      ...sum,
      gap: sum.tracking - sum.annualBudget,
    }
  }, [sortedData])

  const maxGap = useMemo(() => {
    if (sortedData.length === 0) return 1
    const gaps = sortedData.map((row) => Math.abs(row.tracking - row.annualBudget))
    return Math.max(...gaps, Math.abs(totals.gap))
  }, [sortedData, totals.gap])

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
    }
    if (sortDirection === 'asc') {
      return <ArrowUp className="ml-1 h-3 w-3" />
    }
    return <ArrowDown className="ml-1 h-3 w-3" />
  }

  const formatCurrency = (value: number) => {
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
    return formatCurrency(value)
  }

  const formatPercentAbs = (value: number) => {
    const absValue = Math.abs(value)
    if (absValue < 0.1) {
      return '<0.1%'
    }
    return `${absValue.toFixed(1)}%`
  }

  const getGapBar = (gap: number, maxGap: number) => {
    if (gap === 0) return null
    const gapPercent = (Math.abs(gap) / maxGap) * 100
    // Positive gap (tracking > budget) is green, negative gap (tracking < budget) is red
    const isPositive = gap > 0

    return (
      <div className="relative h-2 w-16">
        <div
          className={cn(
            'absolute h-full',
            isPositive ? 'bg-green-500 right-0' : 'bg-red-500 left-0'
          )}
          style={{
            width: `${gapPercent}%`,
          }}
        />
      </div>
    )
  }

  const compactTableClass = '[&_th]:h-5 [&_th]:px-1 [&_th]:py-0 [&_th]:text-[11px] [&_td]:h-5 [&_td]:px-1 [&_td]:py-0 [&_td]:text-[11px]'

  // Calculate gap percentage
  const gapPercent = totals.annualBudget !== 0
    ? ((totals.gap / Math.abs(totals.annualBudget)) * 100)
    : 0

  return (
    <Card>
      <CardHeader className="bg-muted/50 px-4 py-3 pb-4">
        <CardTitle className="text-base">Income</CardTitle>
        <p className="text-sm text-muted-foreground">All amounts are after tax</p>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* Mobile: total card first, then list of summary cards (sm and below) */}
          <div className="md:hidden space-y-3">
            <div className="rounded-lg border border-dashed bg-muted/30 p-3 flex items-center justify-between">
              <span className="font-semibold text-sm">Total Income</span>
              <span
                className={cn(
                  'font-semibold tabular-nums text-sm',
                  totals.gap >= 0 ? 'text-green-600' : 'text-red-600'
                )}
              >
                {formatCurrency(totals.gap)}
              </span>
            </div>
            {sortedData.map((row) => {
              const gap = row.tracking - row.annualBudget
              const isPositive = gap >= 0
              return (
                <div key={row.category} className="rounded-lg border p-3 min-h-[44px]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-sm truncate">{row.category}</span>
                    <span
                      className={cn(
                        'font-semibold tabular-nums text-sm shrink-0',
                        isPositive ? 'text-green-600' : 'text-red-600'
                      )}
                    >
                      {gap === 0 ? '–' : formatCurrency(gap)}
                    </span>
                  </div>
                  <div className="mt-1.5 pt-1.5 border-t text-xs text-muted-foreground">
                    Tracking {formatCurrency(row.tracking)} vs Budget {formatCurrency(row.annualBudget)}
                  </div>
                </div>
              )
            })}
          </div>
          {/* Summary card - left */}
          <div className="space-y-2 p-3 rounded-lg border-2 border-gray-700 bg-card min-w-0">
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-blue-600" />
              <h3 className="font-semibold text-xs uppercase tracking-wide">Income Status</h3>
            </div>
            <div className="space-y-1">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">vs Budget</p>
                {totals.gap >= 0 ? (
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <p className="text-base font-bold text-green-600">Above Budget</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <p className="text-base font-bold text-red-600">Below Budget</p>
                  </div>
                )}
              </div>
              <div className="space-y-0.5 pt-1.5 border-t">
                <p className="text-xs">
                  <span className={cn('font-semibold', totals.gap >= 0 ? 'text-green-600' : 'text-red-600')}>
                    {formatCurrency(Math.abs(totals.gap))}
                  </span>
                  <span className="text-muted-foreground ml-1">
                    {totals.gap >= 0 ? 'above' : 'below'} target
                  </span>
                </p>
                <p className="text-xs">
                  <span className={`font-medium ${totals.gap >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatPercentAbs(gapPercent)}
                  </span>
                  <span className="text-muted-foreground ml-1">
                    {totals.gap >= 0 ? 'above' : 'below'} budget
                  </span>
                </p>
                <div className="pt-0.5 mt-0.5 border-t">
                  <p className="text-xs text-muted-foreground">
                    Income Tracking: <span className="font-medium">{formatCurrencyLarge(totals.tracking)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Income Budget: <span className="font-medium">{formatCurrencyLarge(totals.annualBudget)}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
          {/* Table - right (desktop) */}
          <div className="hidden md:block border rounded-md overflow-hidden min-w-0">
        <Table className={compactTableClass}>
          <TableHeader>
            <TableRow className="bg-muted">
              <TableHead className={cn('bg-muted', sortField === 'category' && 'bg-gray-200 dark:bg-gray-700')}>
                <button
                  onClick={() => onSort('category')}
                  className={cn('flex items-center hover:opacity-70 transition-opacity', sortField === 'category' && 'font-semibold')}
                >
                  Category
                  <SortIcon field="category" />
                </button>
              </TableHead>
              <TableHead className={cn('text-right bg-muted', sortField === 'annualBudget' && 'bg-gray-200 dark:bg-gray-700')}>
                <button
                  onClick={() => onSort('annualBudget')}
                  className={cn('flex items-center justify-end ml-auto hover:opacity-70 transition-opacity', sortField === 'annualBudget' && 'font-semibold')}
                >
                  Budget
                  <SortIcon field="annualBudget" />
                </button>
              </TableHead>
              <TableHead className={cn('text-right bg-muted', sortField === 'tracking' && 'bg-gray-200 dark:bg-gray-700')}>
                <button
                  onClick={() => onSort('tracking')}
                  className={cn('flex items-center justify-end ml-auto hover:opacity-70 transition-opacity', sortField === 'tracking' && 'font-semibold')}
                >
                  Tracking
                  <SortIcon field="tracking" />
                </button>
              </TableHead>
              <TableHead className={cn('text-right bg-muted', sortField === 'ytd' && 'bg-gray-200 dark:bg-gray-700')}>
                <button
                  onClick={() => onSort('ytd')}
                  className={cn('flex items-center justify-end ml-auto hover:opacity-70 transition-opacity', sortField === 'ytd' && 'font-semibold')}
                >
                  YTD
                  <SortIcon field="ytd" />
                </button>
              </TableHead>
              <TableHead className={cn('text-right bg-muted', sortField === 'gap' && 'bg-gray-200 dark:bg-gray-700')}>
                <button
                  onClick={() => onSort('gap')}
                  className={cn('flex items-center justify-end ml-auto hover:opacity-70 transition-opacity', sortField === 'gap' && 'font-semibold')}
                >
                  Gap
                  <SortIcon field="gap" />
                </button>
              </TableHead>
              <TableHead className="w-16 bg-muted"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((row) => {
              // Recalculate gap to ensure it's correct: Gap = Tracking - Budget
              const gap = row.tracking - row.annualBudget
              const isPositive = gap >= 0

              return (
                <TableRow key={row.category}>
                  <TableCell className="font-medium">{row.category}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.annualBudget)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.tracking)}</TableCell>
                  <TableCell className="text-right">
                    {row.ytd === 0 ? '-' : formatCurrency(row.ytd)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-medium',
                      isPositive ? 'text-green-600' : 'text-red-600'
                    )}
                  >
                    {gap === 0 ? '-' : formatCurrency(gap)}
                  </TableCell>
                  <TableCell className="w-16">
                    {getGapBar(gap, maxGap)}
                  </TableCell>
                </TableRow>
              )
            })}
            {/* Total Income Row */}
            <TableRow className="bg-muted/50">
              <TableCell className="font-semibold">Total Income</TableCell>
              <TableCell className="text-right font-semibold">
                {formatCurrency(totals.annualBudget)}
              </TableCell>
              <TableCell className="text-right font-semibold">
                {formatCurrency(totals.tracking)}
              </TableCell>
              <TableCell className="text-right font-semibold">
                {formatCurrency(totals.ytd)}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right font-semibold',
                  totals.gap >= 0 ? 'text-green-600' : 'text-red-600'
                )}
              >
                {formatCurrency(totals.gap)}
              </TableCell>
              <TableCell className="w-16">
                {getGapBar(totals.gap, maxGap)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
