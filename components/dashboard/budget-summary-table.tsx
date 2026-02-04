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
import { CheckCircle2, XCircle, Target, TrendingUp, TrendingDown } from 'lucide-react'

interface BudgetSummaryTableProps {
  incomeData: any[]
  expenseData: any[]
}

export function BudgetSummaryTable({ incomeData, expenseData }: BudgetSummaryTableProps) {
  const { currency } = useCurrency()

  // Calculate totals
  const totals = useMemo(() => {
    const incomeTotal = incomeData.reduce(
      (acc, row) => ({
        annualBudget: acc.annualBudget + row.annualBudget,
        tracking: acc.tracking + row.tracking,
        ytd: acc.ytd + row.ytd,
      }),
      { annualBudget: 0, tracking: 0, ytd: 0 }
    )

    // Expenses are stored as negative values, so we need to handle them differently
    const expenseTotal = expenseData.reduce(
      (acc, row) => ({
        annualBudget: acc.annualBudget + Math.abs(row.annualBudget), // Convert to positive for display
        tracking: acc.tracking + Math.abs(row.tracking), // Convert to positive for display
        ytd: acc.ytd + Math.abs(row.ytd), // Convert to positive for display
        // Keep original negative values for gap calculation
        annualBudgetRaw: acc.annualBudgetRaw + row.annualBudget,
        trackingRaw: acc.trackingRaw + row.tracking,
      }),
      { annualBudget: 0, tracking: 0, ytd: 0, annualBudgetRaw: 0, trackingRaw: 0 }
    )

    const netIncomeBudget = incomeTotal.annualBudget - expenseTotal.annualBudget
    const netIncomeTracking = incomeTotal.tracking - expenseTotal.tracking
    const netIncomeYTD = incomeTotal.ytd - expenseTotal.ytd
    // Gap = Tracking - Budget
    const netIncomeGap = netIncomeTracking - netIncomeBudget
    
    // Calculate gaps for income and expenses: Gap = Tracking - Budget (for all)
    const incomeGap = incomeTotal.tracking - incomeTotal.annualBudget
    // For expenses: use raw (negative) values to calculate gap correctly
    // Gap = Tracking - Budget = trackingRaw - annualBudgetRaw
    // Example: (-192.5k) - (-205.4k) = -192.5k + 205.4k = +12.9k (spending less = positive gap)
    const expenseGap = expenseTotal.trackingRaw - expenseTotal.annualBudgetRaw

    // Calculate savings percentages (savings rate = net income / total income)
    const savingsBudget = incomeTotal.annualBudget !== 0 
      ? ((netIncomeBudget / incomeTotal.annualBudget) * 100) 
      : 0
    const savingsTracking = incomeTotal.tracking !== 0 
      ? ((netIncomeTracking / incomeTotal.tracking) * 100) 
      : 0
    const savingsYTD = incomeTotal.ytd !== 0 
      ? ((netIncomeYTD / incomeTotal.ytd) * 100) 
      : 0

    return {
      income: {
        ...incomeTotal,
        gap: incomeGap,
      },
      expenses: {
        ...expenseTotal,
        gap: expenseGap,
      },
      netIncome: {
        annualBudget: netIncomeBudget,
        tracking: netIncomeTracking,
        ytd: netIncomeYTD,
        gap: netIncomeGap,
      },
      savings: {
        budget: savingsBudget,
        tracking: savingsTracking,
        ytd: savingsYTD,
      },
    }
  }, [incomeData, expenseData])

  const maxGap = useMemo(() => {
    return Math.max(
      Math.abs(totals.income.gap),
      Math.abs(totals.expenses.gap),
      Math.abs(totals.netIncome.gap)
    )
  }, [totals])

  const formatCurrency = (value: number) => {
    // Always format as £0.0k (divide by 1000, show 1 decimal place)
    const valueInK = value / 1000
    const currencySymbol = currency === 'USD' ? '$' : '£'
    return `${currencySymbol}${valueInK.toFixed(1)}k`
  }

  const renderCurrencyAligned = (value: number) => {
    // Format currency with proper alignment for parentheses
    // Use a fixed-width approach to ensure numbers align vertically
    const formatted = formatCurrency(Math.abs(value))
    const isNegative = value < 0
    
    if (isNegative) {
      // Negative values: wrap in parentheses
      return <span className="tabular-nums inline-block w-full text-right">({formatted})</span>
    }
    // For positive values, add invisible padding to match the width of parentheses
    // Using a zero-width space followed by the value, then another space for closing paren
    // This ensures the numbers align when right-aligned
    return <span className="tabular-nums inline-block w-full text-right"><span className="invisible">(</span>{formatted}<span className="invisible">)</span></span>
  }

  const formatPercentage = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(0)}%`
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

  const compactTableClass = '[&_th]:h-8 [&_th]:px-2 [&_th]:py-1 [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wider [&_th]:font-medium [&_td]:h-8 [&_td]:px-2 [&_td]:py-1 [&_td]:text-[13px] [&_td]:tabular-nums'

  const isAllGood = totals.netIncome.gap >= 0 && totals.savings.tracking >= 0
  
  // Calculate gap percentage for net income
  const netIncomeGapPercent = totals.netIncome.annualBudget !== 0
    ? ((totals.netIncome.gap / Math.abs(totals.netIncome.annualBudget)) * 100)
    : 0

  return (
    <Card>
      <CardHeader className="bg-muted/50 px-4 py-3 pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Budget Tracker</CardTitle>
          {isAllGood && (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs font-medium">All Good</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* Summary card - left; on mobile show first (order-1) */}
          <div className="space-y-2 p-3 rounded-lg border bg-card min-w-0 max-md:order-1">
            <div className="flex items-center gap-1.5">
              <Target className="h-4 w-4 text-purple-600" />
              <h3 className="font-semibold text-xs uppercase tracking-wide">Budget Status</h3>
            </div>
            <div className="space-y-1">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Net Income vs Budget</p>
                {totals.netIncome.gap >= 0 ? (
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
                <p className="text-xs">
                  <span className="font-semibold">{formatCurrency(Math.abs(totals.netIncome.gap))}</span>
                  <span className="text-muted-foreground ml-1">
                    {totals.netIncome.gap >= 0 ? 'under' : 'over'} budget
                  </span>
                </p>
                <p className="text-xs">
                  <span className={`font-medium ${totals.netIncome.gap >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatPercentAbs(netIncomeGapPercent)}
                  </span>
                  <span className="text-muted-foreground ml-1">
                    {totals.netIncome.gap >= 0 ? 'under' : 'over'} budget
                  </span>
                </p>
                <div className="pt-1.5 mt-0.5 border-t">
                  <p className="text-xs text-muted-foreground">
                    Net Income Tracking: <span className="font-medium">{totals.netIncome.tracking < 0 ? '(' : ''}{formatCurrencyLarge(Math.abs(totals.netIncome.tracking))}{totals.netIncome.tracking < 0 ? ')' : ''}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Net Income Budget: <span className="font-medium">{totals.netIncome.annualBudget < 0 ? '(' : ''}{formatCurrencyLarge(Math.abs(totals.netIncome.annualBudget))}{totals.netIncome.annualBudget < 0 ? ')' : ''}</span>
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
                  <TableHead className="bg-muted"></TableHead>
                  <TableHead className="text-right bg-muted">Budget</TableHead>
                  <TableHead className="text-right bg-muted">Tracking</TableHead>
                  <TableHead className="text-right bg-muted">YTD</TableHead>
                  <TableHead className="text-right bg-muted">Gap</TableHead>
                  <TableHead className="w-16 bg-muted"></TableHead>
                </TableRow>
              </TableHeader>
          <TableBody>
            {/* Total Income */}
            <TableRow>
              <TableCell className="font-medium">Total Income</TableCell>
              <TableCell className="text-right">{renderCurrencyAligned(totals.income.annualBudget)}</TableCell>
              <TableCell className="text-right">{renderCurrencyAligned(totals.income.tracking)}</TableCell>
              <TableCell className="text-right">{renderCurrencyAligned(totals.income.ytd)}</TableCell>
              <TableCell
                className={cn(
                  'text-right font-medium tabular-nums',
                  totals.income.gap >= 0 ? 'text-green-600' : 'text-red-600'
                )}
              >
                {formatCurrency(totals.income.gap)}
              </TableCell>
              <TableCell className="w-16">
                {getGapBar(totals.income.gap, maxGap)}
              </TableCell>
            </TableRow>

            {/* Expenses */}
            <TableRow>
              <TableCell className="font-medium">Expenses</TableCell>
              <TableCell className="text-right">{renderCurrencyAligned(-totals.expenses.annualBudget)}</TableCell>
              <TableCell className="text-right">{renderCurrencyAligned(-totals.expenses.tracking)}</TableCell>
              <TableCell className="text-right">{renderCurrencyAligned(-totals.expenses.ytd)}</TableCell>
              <TableCell
                className={cn(
                  'text-right font-medium tabular-nums',
                  totals.expenses.gap >= 0 ? 'text-green-600' : 'text-red-600'
                )}
              >
                {formatCurrency(totals.expenses.gap)}
              </TableCell>
              <TableCell className="w-16">
                {getGapBar(totals.expenses.gap, maxGap)}
              </TableCell>
            </TableRow>

            {/* Net Income */}
            <TableRow className="bg-muted/50">
              <TableCell className="font-semibold">Net Income</TableCell>
              <TableCell className="text-right font-semibold">{renderCurrencyAligned(totals.netIncome.annualBudget)}</TableCell>
              <TableCell className="text-right font-semibold">{renderCurrencyAligned(totals.netIncome.tracking)}</TableCell>
              <TableCell className="text-right font-semibold">{renderCurrencyAligned(totals.netIncome.ytd)}</TableCell>
              <TableCell
                className={cn(
                  'text-right font-semibold tabular-nums',
                  totals.netIncome.gap >= 0 ? 'text-green-600' : 'text-red-600'
                )}
              >
                {formatCurrency(totals.netIncome.gap)}
              </TableCell>
              <TableCell className="w-16">
                {getGapBar(totals.netIncome.gap, maxGap)}
              </TableCell>
            </TableRow>

            {/* Savings */}
            <TableRow>
              <TableCell className="text-gray-500 italic">Savings</TableCell>
              <TableCell
                className={cn(
                  'text-right italic',
                  totals.savings.budget < 0 ? 'text-red-600' : 'text-green-600'
                )}
              >
                {formatPercentage(totals.savings.budget)}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right italic',
                  totals.savings.tracking < 0 ? 'text-red-600' : 'text-green-600'
                )}
              >
                {formatPercentage(totals.savings.tracking)}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right italic',
                  totals.savings.ytd < 0 ? 'text-red-600' : 'text-green-600'
                )}
              >
                {formatPercentage(totals.savings.ytd)}
              </TableCell>
              <TableCell></TableCell>
              <TableCell className="w-16"></TableCell>
            </TableRow>
          </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
