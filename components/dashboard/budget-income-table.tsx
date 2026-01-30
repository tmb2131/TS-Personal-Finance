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
      return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
    }
    if (sortDirection === 'asc') {
      return <ArrowUp className="ml-2 h-4 w-4" />
    }
    return <ArrowDown className="ml-2 h-4 w-4" />
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
      <div className="relative h-6 w-full">
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

  // Calculate gap percentage
  const gapPercent = totals.annualBudget !== 0
    ? ((totals.gap / Math.abs(totals.annualBudget)) * 100)
    : 0

  return (
    <Card>
      <CardHeader className="bg-muted/50">
        <CardTitle>Income</CardTitle>
        <p className="text-sm text-muted-foreground">All amounts are after tax</p>
      </CardHeader>
      <CardContent>
        {/* Executive Summary Card */}
        <div className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-3 p-4 rounded-lg border-2 border-gray-700 bg-card">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold text-sm uppercase tracking-wide">Income Status</h3>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-muted-foreground mb-1">vs Budget</p>
                {totals.gap >= 0 ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <p className="text-lg font-bold text-green-600">Above Budget</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-600" />
                    <p className="text-lg font-bold text-red-600">Below Budget</p>
                  </div>
                )}
              </div>
              <div className="space-y-1 pt-2 border-t">
                <p className="text-sm">
                  <span className={cn('font-semibold', totals.gap >= 0 ? 'text-green-600' : 'text-red-600')}>
                    {formatCurrency(Math.abs(totals.gap))}
                  </span>
                  <span className="text-xs text-muted-foreground ml-1">
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
                <div className="pt-1 mt-1 border-t">
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
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted">
              <TableHead className="bg-muted">
                <button
                  onClick={() => onSort('category')}
                  className="flex items-center hover:opacity-70 transition-opacity"
                >
                  Category
                  <SortIcon field="category" />
                </button>
              </TableHead>
              <TableHead className="text-right">
                <button
                  onClick={() => onSort('annualBudget')}
                  className="flex items-center justify-end ml-auto hover:opacity-70 transition-opacity"
                >
                  Budget
                  <SortIcon field="annualBudget" />
                </button>
              </TableHead>
              <TableHead className="text-right bg-muted">
                <button
                  onClick={() => onSort('tracking')}
                  className="flex items-center justify-end ml-auto hover:opacity-70 transition-opacity"
                >
                  Tracking
                  <SortIcon field="tracking" />
                </button>
              </TableHead>
              <TableHead className="text-right">
                <button
                  onClick={() => onSort('ytd')}
                  className="flex items-center justify-end ml-auto hover:opacity-70 transition-opacity"
                >
                  YTD
                  <SortIcon field="ytd" />
                </button>
              </TableHead>
              <TableHead className="text-right bg-muted">
                <button
                  onClick={() => onSort('gap')}
                  className="flex items-center justify-end ml-auto hover:opacity-70 transition-opacity"
                >
                  Gap
                  <SortIcon field="gap" />
                </button>
              </TableHead>
              <TableHead className="w-32 bg-muted"></TableHead>
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
                  <TableCell className="w-32">
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
              <TableCell className="w-32">
                {getGapBar(totals.gap, maxGap)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
