'use client'

import { useMemo } from 'react'
import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { TransactionLog } from '@/lib/types'
import { toLocalDateString } from '@/lib/date-utils'
import { buildGetRateForDate } from '@/lib/utils/fx-rates'
import { cn } from '@/utils/cn'
import { TrendingUp, TrendingDown, Calendar } from 'lucide-react'
import type { ViewMode } from './monthly-category-trends-section'

const EXCLUDED_CATEGORIES = ['Income', 'Gift Money', 'Other Income', 'Excluded']

/** Get the ISO week number and year for a date (Monday-based weeks) */
function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return { year: d.getUTCFullYear(), week: weekNo }
}

interface MonthlyCategorySummaryProps {
  transactions: TransactionLog[]
  categories: string[]
  selectedCategory: string
  onCategoryChange: (category: string) => void
  getRateForDate: (dateStr: string) => number
  viewMode?: ViewMode
  hideCard?: boolean
}

interface SummaryRow {
  label: string
  currentMonth: number
  vsL3M: number | null
  vsL12M: number | null
  vsLY: number | null
}

export function MonthlyCategorySummary({
  transactions,
  categories,
  selectedCategory,
  onCategoryChange,
  getRateForDate,
  viewMode = 'monthly',
  hideCard = false,
}: MonthlyCategorySummaryProps) {
  const { currency } = useCurrency()
  const isMobile = useIsMobile()

  const summaryData = useMemo(() => {
    if (!selectedCategory || transactions.length === 0) return null

    // Filter transactions for selected category (or all if "Total Expenses")
    const categoryTransactions = selectedCategory === 'Total Expenses'
      ? transactions
      : transactions.filter((tx) => tx.category === selectedCategory)

    if (categoryTransactions.length === 0) return null

    // Helper to get tx amount
    const getTxAmount = (tx: TransactionLog): number => {
      const rate = getRateForDate(typeof tx.date === 'string' ? tx.date.split('T')[0] : tx.date)
      return currency === 'USD'
        ? (tx.amount_usd ?? (tx.amount_gbp != null ? tx.amount_gbp * rate : 0))
        : (tx.amount_gbp ?? (tx.amount_usd != null ? tx.amount_usd / rate : 0))
    }

    // Find top counterparty across ALL transactions (first 7 letters)
    const allCounterpartyTotals = new Map<string, { total: number; fullName: string }>()

    categoryTransactions.forEach((tx) => {
      const amount = getTxAmount(tx)
      if (amount < 0) {
        const absAmount = Math.abs(amount)
        const counterparty = tx.counterparty || 'Unknown'
        const counterpartyKey = counterparty.substring(0, 7).trim()

        if (allCounterpartyTotals.has(counterpartyKey)) {
          const existing = allCounterpartyTotals.get(counterpartyKey)!
          existing.total += absAmount
          if (counterparty.length > existing.fullName.length) {
            existing.fullName = counterparty
          }
        } else {
          allCounterpartyTotals.set(counterpartyKey, {
            total: absAmount,
            fullName: counterparty,
          })
        }
      }
    })

    let topCounterpartyKey = ''
    let topCounterpartyFullName = ''
    let topTotalAmount = 0

    allCounterpartyTotals.forEach((data, key) => {
      if (data.total > topTotalAmount) {
        topTotalAmount = data.total
        topCounterpartyKey = key
        topCounterpartyFullName = data.fullName
      }
    })

    // Process a list of transactions into grouped amounts
    const processTransactions = (txs: TransactionLog[]): { topAmount: number; otherAmount: number; total: number } => {
      let topAmount = 0
      let total = 0

      txs.forEach((tx) => {
        const amount = getTxAmount(tx)
        if (amount < 0) {
          const absAmount = Math.abs(amount)
          total += absAmount
          const counterparty = tx.counterparty || 'Unknown'
          const counterpartyKey = counterparty.substring(0, 7).trim()
          if (counterpartyKey === topCounterpartyKey) {
            topAmount += absAmount
          }
        }
      })

      return { topAmount, otherAmount: total - topAmount, total }
    }

    // Helper to compute comparisons and percentages
    const computeComparisons = (
      periodGroups: Map<string, { topAmount: number; otherAmount: number; total: number }>,
      allPeriods: string[],
      currentIndex: number,
      l3Count: number,
      lyPeriodKey: string | null,
    ) => {
      const currentData = periodGroups.get(allPeriods[currentIndex])!

      let l3TopSum = 0, l3OtherSum = 0, l3TotalSum = 0, l3Cnt = 0
      let l12TopSum = 0, l12OtherSum = 0, l12TotalSum = 0, l12Cnt = 0

      for (let i = Math.max(0, currentIndex - l3Count); i < currentIndex; i++) {
        const d = periodGroups.get(allPeriods[i])
        if (d && d.total > 0) { l3TopSum += d.topAmount; l3OtherSum += d.otherAmount; l3TotalSum += d.total; l3Cnt++ }
      }
      for (let i = 0; i < currentIndex; i++) {
        const d = periodGroups.get(allPeriods[i])
        if (d && d.total > 0) { l12TopSum += d.topAmount; l12OtherSum += d.otherAmount; l12TotalSum += d.total; l12Cnt++ }
      }

      const l3mTopAvg = l3Cnt > 0 ? l3TopSum / l3Cnt : null
      const l3mOtherAvg = l3Cnt > 0 ? l3OtherSum / l3Cnt : null
      const l3mTotalAvg = l3Cnt > 0 ? l3TotalSum / l3Cnt : null
      const l12mTopAvg = l12Cnt > 0 ? l12TopSum / l12Cnt : null
      const l12mOtherAvg = l12Cnt > 0 ? l12OtherSum / l12Cnt : null
      const l12mTotalAvg = l12Cnt > 0 ? l12TotalSum / l12Cnt : null

      const lyData = lyPeriodKey ? periodGroups.get(lyPeriodKey) : undefined

      const calcDelta = (current: number, avg: number | null) => avg !== null ? current - avg : null
      const calcPct = (current: number, avg: number | null) => avg !== null && avg !== 0 ? ((current - avg) / avg) * 100 : null

      return {
        absolute: {
          top: { current: currentData.topAmount, vsL3M: calcDelta(currentData.topAmount, l3mTopAvg), vsL12M: calcDelta(currentData.topAmount, l12mTopAvg), vsLY: lyData ? currentData.topAmount - lyData.topAmount : null },
          other: { current: currentData.otherAmount, vsL3M: calcDelta(currentData.otherAmount, l3mOtherAvg), vsL12M: calcDelta(currentData.otherAmount, l12mOtherAvg), vsLY: lyData ? currentData.otherAmount - lyData.otherAmount : null },
          total: { current: currentData.total, vsL3M: calcDelta(currentData.total, l3mTotalAvg), vsL12M: calcDelta(currentData.total, l12mTotalAvg), vsLY: lyData ? currentData.total - lyData.total : null },
        },
        percentage: {
          top: { current: currentData.topAmount, vsL3M: calcPct(currentData.topAmount, l3mTopAvg), vsL12M: calcPct(currentData.topAmount, l12mTopAvg), vsLY: lyData && lyData.topAmount !== 0 ? ((currentData.topAmount - lyData.topAmount) / lyData.topAmount) * 100 : null },
          other: { current: currentData.otherAmount, vsL3M: calcPct(currentData.otherAmount, l3mOtherAvg), vsL12M: calcPct(currentData.otherAmount, l12mOtherAvg), vsLY: lyData && lyData.otherAmount !== 0 ? ((currentData.otherAmount - lyData.otherAmount) / lyData.otherAmount) * 100 : null },
          total: { current: currentData.total, vsL3M: calcPct(currentData.total, l3mTotalAvg), vsL12M: calcPct(currentData.total, l12mTotalAvg), vsLY: lyData && lyData.total !== 0 ? ((currentData.total - lyData.total) / lyData.total) * 100 : null },
        },
      }
    }

    // Helper to parse tx date string
    const parseDateStr = (tx: TransactionLog): string | null => {
      if (!tx.date) return null
      return typeof tx.date === 'string' ? tx.date.split('T')[0] : toLocalDateString(new Date(tx.date))
    }

    if (viewMode === 'weekly') {
      // WEEKLY VIEW: 13 weeks ending at last full week
      const today = new Date()
      const dayOfWeek = today.getUTCDay() || 7
      const lastSunday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
      lastSunday.setUTCDate(lastSunday.getUTCDate() - dayOfWeek)
      const lastFullWeekMonday = new Date(lastSunday)
      lastFullWeekMonday.setUTCDate(lastFullWeekMonday.getUTCDate() - 6)
      const startMonday = new Date(lastFullWeekMonday)
      startMonday.setUTCDate(startMonday.getUTCDate() - 12 * 7)

      const allWeeks: string[] = []
      const cursor = new Date(startMonday)
      for (let i = 0; i < 13; i++) {
        const { year, week } = getISOWeek(cursor)
        allWeeks.push(`${year}-W${String(week).padStart(2, '0')}`)
        cursor.setUTCDate(cursor.getUTCDate() + 7)
      }

      // Group transactions by week
      const weeklyGroups = new Map<string, TransactionLog[]>()
      allWeeks.forEach(w => weeklyGroups.set(w, []))

      categoryTransactions.forEach((tx) => {
        const dateStr = parseDateStr(tx)
        if (!dateStr) return
        const [y, m, d] = dateStr.split('-').map(Number)
        const txDate = new Date(Date.UTC(y, m - 1, d))
        const { year, week } = getISOWeek(txDate)
        const weekKey = `${year}-W${String(week).padStart(2, '0')}`
        if (weeklyGroups.has(weekKey)) {
          weeklyGroups.get(weekKey)!.push(tx)
        }
      })

      // Process each week
      const periodGroups = new Map<string, { topAmount: number; otherAmount: number; total: number }>()
      allWeeks.forEach((weekKey) => {
        periodGroups.set(weekKey, processTransactions(weeklyGroups.get(weekKey) || []))
      })

      const mostRecentWeek = allWeeks[allWeeks.length - 1]
      const currentWeekData = periodGroups.get(mostRecentWeek)
      if (!currentWeekData || currentWeekData.total === 0) return null

      const currentIndex = allWeeks.length - 1

      // Format week label
      const parts = mostRecentWeek.split('-W')
      const weekStart = new Date(Date.UTC(parseInt(parts[0]), 0, 4))
      const wd = weekStart.getUTCDay() || 7
      weekStart.setUTCDate(weekStart.getUTCDate() - wd + 1 + (parseInt(parts[1]) - 1) * 7)
      const periodLabel = `w/c ${weekStart.getUTCDate()} ${weekStart.toLocaleDateString('en-GB', { month: 'short' })}`

      const comparisons = computeComparisons(periodGroups, allWeeks, currentIndex, 3, null)

      return {
        monthLabel: periodLabel,
        topTransactionName: topCounterpartyFullName,
        categoryName: selectedCategory,
        ...comparisons,
      }
    }

    // MONTHLY VIEW (existing logic)
    const today = new Date()
    const lastFullMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const startDate = new Date(lastFullMonth.getFullYear(), lastFullMonth.getMonth() - 12, 1)

    const allMonths: string[] = []
    const currentMonth = new Date(startDate)
    for (let i = 0; i < 13; i++) {
      const year = currentMonth.getFullYear()
      const month = currentMonth.getMonth() + 1
      allMonths.push(`${year}-${String(month).padStart(2, '0')}`)
      currentMonth.setMonth(currentMonth.getMonth() + 1)
    }

    // Group transactions by month
    const monthlyTxGroups = new Map<string, TransactionLog[]>()
    allMonths.forEach(m => monthlyTxGroups.set(m, []))

    categoryTransactions.forEach((tx) => {
      const dateStr = parseDateStr(tx)
      if (!dateStr) return
      const [yearStr, monthStr] = dateStr.split('-')
      if (!yearStr || !monthStr) return
      const year = parseInt(yearStr, 10)
      const month = parseInt(monthStr, 10)
      if (isNaN(year) || isNaN(month)) return
      const monthKey = `${year}-${String(month).padStart(2, '0')}`
      if (monthlyTxGroups.has(monthKey)) {
        monthlyTxGroups.get(monthKey)!.push(tx)
      }
    })

    const periodGroups = new Map<string, { topAmount: number; otherAmount: number; total: number }>()
    allMonths.forEach((monthKey) => {
      periodGroups.set(monthKey, processTransactions(monthlyTxGroups.get(monthKey) || []))
    })

    const mostRecentMonth = allMonths[allMonths.length - 1]
    const currentMonthData = periodGroups.get(mostRecentMonth)
    if (!currentMonthData || currentMonthData.total === 0) return null

    const currentMonthIndex = allMonths.indexOf(mostRecentMonth)

    // LY: Same month from previous year
    const [year, month] = mostRecentMonth.split('-')
    const lastYearMonth = `${parseInt(year) - 1}-${month}`

    const comparisons = computeComparisons(periodGroups, allMonths, currentMonthIndex, 3, lastYearMonth)

    // Format month label
    const [yearNum, monthNum] = mostRecentMonth.split('-')
    const monthDate = new Date(parseInt(yearNum), parseInt(monthNum) - 1)
    const monthLabel = monthDate.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })

    return {
      monthLabel,
      topTransactionName: topCounterpartyFullName,
      categoryName: selectedCategory,
      ...comparisons,
    }
  }, [transactions, selectedCategory, currency, getRateForDate, viewMode])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatPercentage = (value: number | null) => {
    if (value === null) return 'N/A'
    const sign = value >= 0 ? '+' : ''
    return `${sign}${Math.round(value)}%`
  }

  const formatChange = (value: number | null) => {
    if (value === null) return 'N/A'
    const sign = value >= 0 ? '+' : ''
    return `${sign}${formatCurrency(Math.abs(value || 0))}`
  }

  if (!summaryData) return null

  const comparisonCards = [
    {
      label: viewMode === 'weekly' ? 'vs. L3W Avg' : 'vs. L3M Avg',
      absolute: {
        top: summaryData.absolute.top.vsL3M,
        other: summaryData.absolute.other.vsL3M,
        total: summaryData.absolute.total.vsL3M,
      },
      percentage: {
        top: summaryData.percentage.top.vsL3M,
        other: summaryData.percentage.other.vsL3M,
        total: summaryData.percentage.total.vsL3M,
      },
    },
    {
      label: viewMode === 'weekly' ? 'vs. L12W Avg' : 'vs. L12M Avg',
      absolute: {
        top: summaryData.absolute.top.vsL12M,
        other: summaryData.absolute.other.vsL12M,
        total: summaryData.absolute.total.vsL12M,
      },
      percentage: {
        top: summaryData.percentage.top.vsL12M,
        other: summaryData.percentage.other.vsL12M,
        total: summaryData.percentage.total.vsL12M,
      },
    },
    ...(viewMode === 'monthly' ? [{
      label: 'vs. LY',
      absolute: {
        top: summaryData.absolute.top.vsLY,
        other: summaryData.absolute.other.vsLY,
        total: summaryData.absolute.total.vsLY,
      },
      percentage: {
        top: summaryData.percentage.top.vsLY,
        other: summaryData.percentage.other.vsLY,
        total: summaryData.percentage.total.vsLY,
      },
    }] : []),
  ]

  // Get icon and color for each comparison type
  const getComparisonIcon = (label: string) => {
    if (label.includes('L3')) return { Icon: Calendar, color: 'text-muted-foreground dark:text-muted-foreground', pill: 'bg-muted' }
    if (label.includes('L12')) return { Icon: Calendar, color: 'text-muted-foreground dark:text-muted-foreground', pill: 'bg-muted' }
    if (label.includes('LY')) return { Icon: Calendar, color: 'text-muted-foreground dark:text-muted-foreground', pill: 'bg-muted' }
    return { Icon: Calendar, color: 'text-muted-foreground', pill: 'bg-muted' }
  }

  // Generate intelligent executive summary with color-coded highlights
  const getExecutiveSummary = () => {
    const { categoryName, monthLabel, absolute, percentage } = summaryData
    const vsL3M = absolute.total.vsL3M
    const vsL12M = absolute.total.vsL12M
    const vsLY = absolute.total.vsLY
    const vsL3MPct = percentage.total.vsL3M
    const vsL12MPct = percentage.total.vsL12M
    const vsLYPct = percentage.total.vsLY
    
    // Analyze short-term vs long-term trends
    const shortTermTrends = [
      { value: vsL3M, pct: vsL3MPct },
      { value: vsL12M, pct: vsL12MPct },
    ].filter(t => t.value !== null)
    
    const longTermTrend = vsLY !== null ? { value: vsLY, pct: vsLYPct } : null
    
    // Determine if spending is generally up or down vs averages
    const avgDirection = shortTermTrends.length > 0 
      ? shortTermTrends.every(t => t.value! < 0) ? 'decreased'
      : shortTermTrends.every(t => t.value! > 0) ? 'increased'
      : null
      : null
    
    // Build the summary parts
    const parts: React.ReactNode[] = []
    
    const periodDesc = viewMode === 'weekly' ? "Last week's spend" : "Last month's spend"
    const shortAvgLabel = viewMode === 'weekly' ? '3-week average' : '3-month average'
    const longAvgLabel = viewMode === 'weekly' ? '12-week average' : '12-month average'

    // First part: describe trend vs averages
    if (avgDirection === 'decreased' && shortTermTrends.length > 0) {
      parts.push(
        <>
          {periodDesc}{' '}
          <span className="font-bold text-positive">decreased</span> relative to{' '}
          <span className="font-bold">recent short-term and long-term averages</span>
        </>
      )
    } else if (avgDirection === 'increased' && shortTermTrends.length > 0) {
      parts.push(
        <>
          {periodDesc}{' '}
          <span className="font-bold text-negative">increased</span> relative to{' '}
          <span className="font-bold">recent short-term and long-term averages</span>
        </>
      )
    } else if (shortTermTrends.length > 0) {
      // Mixed trends - determine which is more significant
      const l3mAbs = Math.abs(vsL3MPct || 0)
      const l12mAbs = Math.abs(vsL12MPct || 0)
      if (l3mAbs > l12mAbs && vsL3M !== null) {
        const direction = vsL3M < 0 ? 'decreased' : 'increased'
        const color = vsL3M < 0 ? 'text-positive' : 'text-negative'
        parts.push(
          <>
            {periodDesc}{' '}
            <span className={cn('font-bold', color)}>{direction}</span> relative to the{' '}
            <span className="font-bold">{shortAvgLabel}</span>
          </>
        )
      } else if (vsL12M !== null) {
        const direction = vsL12M < 0 ? 'decreased' : 'increased'
        const color = vsL12M < 0 ? 'text-positive' : 'text-negative'
        parts.push(
          <>
            {periodDesc}{' '}
            <span className={cn('font-bold', color)}>{direction}</span> relative to the{' '}
            <span className="font-bold">{longAvgLabel}</span>
          </>
        )
      } else {
        parts.push(`${periodDesc} in ${monthLabel}`)
      }
    } else {
      parts.push(`${periodDesc} in ${monthLabel}`)
    }
    
    // Second part: add year-over-year comparison if available and significant (monthly only)
    if (viewMode === 'monthly' && longTermTrend && longTermTrend.value !== null && longTermTrend.pct !== null) {
      const lyPct = Math.abs(longTermTrend.pct)
      const lySign = longTermTrend.value > 0 ? 'up' : 'down'
      const lyDirection = longTermTrend.value > 0 ? 'significantly higher' : 'significantly lower'
      const lyColor = longTermTrend.value > 0 ? 'text-negative' : 'text-positive'
      
      // Add year-over-year comparison if meaningful (>5%)
      if (lyPct > 5) {
        // Determine if there's a contrast or alignment with the average trend
        const avgIsDecreased = avgDirection === 'decreased'
        const avgIsIncreased = avgDirection === 'increased'
        const lyIsHigher = longTermTrend.value > 0
        const lyIsLower = longTermTrend.value < 0
        
        // Use "yet" when there's a contrast (opposite directions)
        // Use "and" when trends align (same direction)
        const connector = (avgIsDecreased && lyIsHigher) || (avgIsIncreased && lyIsLower) 
          ? 'yet remains' 
          : 'and remains'
        
        parts.push(
          <>
            {connector}{' '}
            <span className={cn('font-bold', lyColor)}>{lyDirection}</span>{' '}
            (<span className={cn('font-bold', lyColor)}>{lySign} {Math.round(lyPct)}%</span>) compared to the{' '}
            <span className="font-bold">same period last year</span>
          </>
        )
      }
    }
    
    // Fallback if we don't have enough data
    if (parts.length === 0) {
      return <>{categoryName} spending in {monthLabel} — monthly trends and historical comparison</>
    }
    
    return (
      <>
        {parts.map((part, index) => (
          <React.Fragment key={index}>
            {part}
            {index < parts.length - 1 ? ', ' : '.'}
          </React.Fragment>
        ))}
      </>
    )
  }

  const summaryAccent = summaryData.absolute.total.vsL3M !== null
    ? summaryData.absolute.total.vsL3M < 0
      ? 'border-l-[3px] border-l-positive'
      : 'border-l-[3px] border-l-negative'
    : ''

  const content = (
    <div>
      <div className={cn('rounded-lg border border-border bg-background p-3 shadow-sm mb-4', summaryAccent)}>
        <p className="text-sm">
          {getExecutiveSummary()}
        </p>
      </div>
      <div className={cn(isMobile && 'relative')}>
        <div className={cn(
          isMobile
            ? 'flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin -mx-1 px-1'
            : 'grid md:grid-cols-2 lg:grid-cols-3 gap-6'
        )}>
          {comparisonCards.map((comparison) => {
            const { Icon, color, pill } = getComparisonIcon(comparison.label)
            const changeAmount = comparison.absolute.total
            const changePercentage = comparison.percentage.total
            const isSpendingLess = changeAmount !== null && changeAmount < 0
            const isSpendingMore = changeAmount !== null && changeAmount > 0
            
            // Format comparison label for display
            const comparisonLabel = comparison.label.replace('vs. ', '')
            
            return (
              <div
                key={comparison.label}
                className={cn(
                  'space-y-1.5 rounded-lg border bg-card p-2.5 shrink-0 text-left w-full',
                  isMobile && 'min-w-[85%] max-w-[85%] snap-center'
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={cn('flex h-7 w-7 items-center justify-center rounded-full shrink-0', pill)}>
                    <Icon className={cn('h-4 w-4', color)} />
                  </div>
                  <h3 className="font-semibold text-sm uppercase tracking-wide">{comparison.label}</h3>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{viewMode === 'weekly' ? 'Latest Week' : 'Latest Month'}</p>
                  {changeAmount !== null ? (
                    isSpendingLess ? (
                      <div className="flex items-center gap-1.5">
                        <TrendingDown className="h-4 w-4 text-positive" />
                        <p className="text-lg font-bold text-positive">Lower Than Average</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="h-4 w-4 text-negative" />
                        <p className="text-lg font-bold text-negative">Higher Than Average</p>
                      </div>
                    )
                  ) : (
                    <p className="text-lg font-bold">No Data</p>
                  )}
                </div>
                {changeAmount !== null && (
                  <div className="space-y-1 pt-1.5 border-t">
                    <p className="text-sm">
                      <span className={cn(
                        'font-semibold',
                        isSpendingLess ? 'text-positive' : 'text-negative'
                      )}>
                        {isSpendingLess ? '' : '+'}{formatCurrency(Math.abs(changeAmount))}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">
                        {isSpendingLess ? 'less' : 'more'} than {comparisonLabel.toLowerCase()}
                      </span>
                    </p>
                    {changePercentage !== null && (
                      <p className="text-xs">
                        <span className={cn(
                          'font-medium',
                          isSpendingLess ? 'text-positive' : 'text-negative'
                        )}>
                          {formatPercentage(changePercentage)}
                        </span>
                        <span className="text-muted-foreground ml-1">
                          {isSpendingLess ? 'less' : 'more'} than {comparisonLabel.toLowerCase()}
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {isMobile && (
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 scroll-fade-right" aria-hidden />
        )}
      </div>
    </div>
  )

  if (hideCard) {
    return content
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <CardTitle className="text-base">
            {viewMode === 'weekly' ? 'Weekly' : 'Monthly'} Category Summary - {summaryData.categoryName} ({summaryData.monthLabel})
          </CardTitle>
          {categories.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="category-select-summary" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                Category:
              </label>
              <select
                id="category-select-summary"
                value={selectedCategory}
                onChange={(e) => onCategoryChange(e.target.value)}
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
      <CardContent className="pt-2 md:pt-2">
        {content}
      </CardContent>
    </Card>
  )
}
