'use client'

import { useMemo } from 'react'
import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { TransactionLog } from '@/lib/types'
import { buildGetRateForDate } from '@/lib/utils/fx-rates'
import { cn } from '@/utils/cn'
import { TrendingUp, TrendingDown, Calendar } from 'lucide-react'

const EXCLUDED_CATEGORIES = ['Income', 'Gift Money', 'Other Income', 'Excluded']

interface MonthlyCategorySummaryProps {
  transactions: TransactionLog[]
  categories: string[]
  selectedCategory: string
  onCategoryChange: (category: string) => void
  getRateForDate: (dateStr: string) => number
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
  hideCard = false,
}: MonthlyCategorySummaryProps) {
  const { currency } = useCurrency()
  const isMobile = useIsMobile()

  const summaryData = useMemo(() => {
    if (!selectedCategory || transactions.length === 0) return null

    // Filter transactions for selected category
    const categoryTransactions = transactions.filter((tx) => tx.category === selectedCategory)

    if (categoryTransactions.length === 0) return null

    // Calculate the expected 13-month range (same as chart)
    const today = new Date()
    const lastFullMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const endDate = new Date(today.getFullYear(), today.getMonth(), 0)
    const startDate = new Date(lastFullMonth.getFullYear(), lastFullMonth.getMonth() - 12, 1)

    // Find the top transaction across ALL months (first 7 letters)
    const allCounterpartyTotals = new Map<string, { total: number; fullName: string }>()

    categoryTransactions.forEach((tx) => {
      const rate = getRateForDate(typeof tx.date === 'string' ? tx.date.split('T')[0] : tx.date)
      const amount = currency === 'USD'
        ? (tx.amount_usd ?? (tx.amount_gbp != null ? tx.amount_gbp * rate : 0))
        : (tx.amount_gbp ?? (tx.amount_usd != null ? tx.amount_usd / rate : 0))

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

    // Find top counterparty
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

    // Group transactions by month
    const monthlyGroups = new Map<string, { topAmount: number; otherAmount: number; total: number }>()

    // Generate all 13 months
    const allMonths: string[] = []
    const currentMonth = new Date(startDate)
    for (let i = 0; i < 13; i++) {
      const year = currentMonth.getFullYear()
      const month = currentMonth.getMonth() + 1
      const monthKey = `${year}-${String(month).padStart(2, '0')}`
      allMonths.push(monthKey)
      currentMonth.setMonth(currentMonth.getMonth() + 1)
    }

    // Process each month
    allMonths.forEach((monthKey) => {
      let topAmount = 0
      let totalAmount = 0

      categoryTransactions.forEach((tx) => {
        if (!tx.date) return

        const dateStr = typeof tx.date === 'string' ? tx.date.split('T')[0] : new Date(tx.date).toISOString().split('T')[0]
        const [yearStr, monthStr] = dateStr.split('-')

        if (!yearStr || !monthStr) return

        const year = parseInt(yearStr, 10)
        const month = parseInt(monthStr, 10)

        if (isNaN(year) || isNaN(month)) return

        const txMonthKey = `${year}-${String(month).padStart(2, '0')}`

        if (txMonthKey === monthKey) {
          const rate = getRateForDate(dateStr)
          const amount = currency === 'USD'
            ? (tx.amount_usd ?? (tx.amount_gbp != null ? tx.amount_gbp * rate : 0))
            : (tx.amount_gbp ?? (tx.amount_usd != null ? tx.amount_usd / rate : 0))

          if (amount < 0) {
            const absAmount = Math.abs(amount)
            totalAmount += absAmount

            const counterparty = tx.counterparty || 'Unknown'
            const counterpartyKey = counterparty.substring(0, 7).trim()

            if (counterpartyKey === topCounterpartyKey) {
              topAmount += absAmount
            }
          }
        }
      })

      const otherAmount = totalAmount - topAmount
      monthlyGroups.set(monthKey, { topAmount, otherAmount, total: totalAmount })
    })

    // Get the most recent month (last full month)
    const mostRecentMonth = allMonths[allMonths.length - 1]
    const currentMonthData = monthlyGroups.get(mostRecentMonth)

    if (!currentMonthData || currentMonthData.total === 0) return null

    // Calculate historical averages
    const currentMonthIndex = allMonths.indexOf(mostRecentMonth)
    
    // Calculate averages for top transaction, other, and total separately
    let l3mTopSum = 0
    let l3mOtherSum = 0
    let l3mTotalSum = 0
    let l3mCount = 0
    
    let l12mTopSum = 0
    let l12mOtherSum = 0
    let l12mTotalSum = 0
    let l12mCount = 0

    for (let i = Math.max(0, currentMonthIndex - 3); i < currentMonthIndex; i++) {
      const monthData = monthlyGroups.get(allMonths[i])
      if (monthData && monthData.total > 0) {
        l3mTopSum += monthData.topAmount
        l3mOtherSum += monthData.otherAmount
        l3mTotalSum += monthData.total
        l3mCount++
      }
    }

    for (let i = 0; i < currentMonthIndex; i++) {
      const monthData = monthlyGroups.get(allMonths[i])
      if (monthData && monthData.total > 0) {
        l12mTopSum += monthData.topAmount
        l12mOtherSum += monthData.otherAmount
        l12mTotalSum += monthData.total
        l12mCount++
      }
    }

    const l3mTopAvg = l3mCount > 0 ? l3mTopSum / l3mCount : null
    const l3mOtherAvg = l3mCount > 0 ? l3mOtherSum / l3mCount : null
    const l3mTotalAvg = l3mCount > 0 ? l3mTotalSum / l3mCount : null

    const l12mTopAvg = l12mCount > 0 ? l12mTopSum / l12mCount : null
    const l12mOtherAvg = l12mCount > 0 ? l12mOtherSum / l12mCount : null
    const l12mTotalAvg = l12mCount > 0 ? l12mTotalSum / l12mCount : null

    // LY: Same month from previous year
    const [year, month] = mostRecentMonth.split('-')
    const lastYearMonth = `${parseInt(year) - 1}-${month}`
    const lyData = monthlyGroups.get(lastYearMonth)

    // Calculate comparisons for each row
    const topComparisons = {
      vsL3M: l3mTopAvg !== null ? currentMonthData.topAmount - l3mTopAvg : null,
      vsL12M: l12mTopAvg !== null ? currentMonthData.topAmount - l12mTopAvg : null,
      vsLY: lyData ? currentMonthData.topAmount - lyData.topAmount : null,
    }

    const otherComparisons = {
      vsL3M: l3mOtherAvg !== null ? currentMonthData.otherAmount - l3mOtherAvg : null,
      vsL12M: l12mOtherAvg !== null ? currentMonthData.otherAmount - l12mOtherAvg : null,
      vsLY: lyData ? currentMonthData.otherAmount - lyData.otherAmount : null,
    }

    const totalComparisons = {
      vsL3M: l3mTotalAvg !== null ? currentMonthData.total - l3mTotalAvg : null,
      vsL12M: l12mTotalAvg !== null ? currentMonthData.total - l12mTotalAvg : null,
      vsLY: lyData ? currentMonthData.total - lyData.total : null,
    }

    // Calculate percentage changes
    const topPercentages = {
      vsL3M: l3mTopAvg !== null && l3mTopAvg !== 0 ? ((currentMonthData.topAmount - l3mTopAvg) / l3mTopAvg) * 100 : null,
      vsL12M: l12mTopAvg !== null && l12mTopAvg !== 0 ? ((currentMonthData.topAmount - l12mTopAvg) / l12mTopAvg) * 100 : null,
      vsLY: lyData && lyData.topAmount !== 0 ? ((currentMonthData.topAmount - lyData.topAmount) / lyData.topAmount) * 100 : null,
    }

    const otherPercentages = {
      vsL3M: l3mOtherAvg !== null && l3mOtherAvg !== 0 ? ((currentMonthData.otherAmount - l3mOtherAvg) / l3mOtherAvg) * 100 : null,
      vsL12M: l12mOtherAvg !== null && l12mOtherAvg !== 0 ? ((currentMonthData.otherAmount - l12mOtherAvg) / l12mOtherAvg) * 100 : null,
      vsLY: lyData && lyData.otherAmount !== 0 ? ((currentMonthData.otherAmount - lyData.otherAmount) / lyData.otherAmount) * 100 : null,
    }

    const totalPercentages = {
      vsL3M: l3mTotalAvg !== null && l3mTotalAvg !== 0 ? ((currentMonthData.total - l3mTotalAvg) / l3mTotalAvg) * 100 : null,
      vsL12M: l12mTotalAvg !== null && l12mTotalAvg !== 0 ? ((currentMonthData.total - l12mTotalAvg) / l12mTotalAvg) * 100 : null,
      vsLY: lyData && lyData.total !== 0 ? ((currentMonthData.total - lyData.total) / lyData.total) * 100 : null,
    }

    // Format month label
    const [yearNum, monthNum] = mostRecentMonth.split('-')
    const monthDate = new Date(parseInt(yearNum), parseInt(monthNum) - 1)
    const monthLabel = monthDate.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })

    return {
      monthLabel,
      topTransactionName: topCounterpartyFullName,
      categoryName: selectedCategory,
      absolute: {
        top: {
          current: currentMonthData.topAmount,
          ...topComparisons,
        },
        other: {
          current: currentMonthData.otherAmount,
          ...otherComparisons,
        },
        total: {
          current: currentMonthData.total,
          ...totalComparisons,
        },
      },
      percentage: {
        top: {
          current: currentMonthData.topAmount,
          ...topPercentages,
        },
        other: {
          current: currentMonthData.otherAmount,
          ...otherPercentages,
        },
        total: {
          current: currentMonthData.total,
          ...totalPercentages,
        },
      },
    }
  }, [transactions, selectedCategory, currency, getRateForDate])

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
      label: 'vs. L3M Avg',
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
      label: 'vs. L12M Avg',
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
    {
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
    },
  ]

  // Get icon and color for each comparison type
  const getComparisonIcon = (label: string) => {
    if (label.includes('L3M')) return { Icon: Calendar, color: 'text-indigo-600' }
    if (label.includes('L12M')) return { Icon: Calendar, color: 'text-purple-600' }
    if (label.includes('LY')) return { Icon: Calendar, color: 'text-orange-600' }
    return { Icon: Calendar, color: 'text-gray-600' }
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
    
    // First part: describe trend vs averages
    if (avgDirection === 'decreased' && shortTermTrends.length > 0) {
      parts.push(
        <>
          Last month's spend{' '}
          <span className="font-bold text-green-600">decreased</span> relative to{' '}
          <span className="font-bold">recent short-term and long-term averages</span>
        </>
      )
    } else if (avgDirection === 'increased' && shortTermTrends.length > 0) {
      parts.push(
        <>
          Last month's spend{' '}
          <span className="font-bold text-red-600">increased</span> relative to{' '}
          <span className="font-bold">recent short-term and long-term averages</span>
        </>
      )
    } else if (shortTermTrends.length > 0) {
      // Mixed trends - determine which is more significant
      const l3mAbs = Math.abs(vsL3MPct || 0)
      const l12mAbs = Math.abs(vsL12MPct || 0)
      if (l3mAbs > l12mAbs && vsL3M !== null) {
        const direction = vsL3M < 0 ? 'decreased' : 'increased'
        const color = vsL3M < 0 ? 'text-green-600' : 'text-red-600'
        parts.push(
          <>
            Last month's spend{' '}
            <span className={cn('font-bold', color)}>{direction}</span> relative to the{' '}
            <span className="font-bold">3-month average</span>
          </>
        )
      } else if (vsL12M !== null) {
        const direction = vsL12M < 0 ? 'decreased' : 'increased'
        const color = vsL12M < 0 ? 'text-green-600' : 'text-red-600'
        parts.push(
          <>
            Last month's spend{' '}
            <span className={cn('font-bold', color)}>{direction}</span> relative to the{' '}
            <span className="font-bold">12-month average</span>
          </>
        )
      } else {
        parts.push(`Last month's spend in ${monthLabel}`)
      }
    } else {
      parts.push(`Last month's spend in ${monthLabel}`)
    }
    
    // Second part: add year-over-year comparison if available and significant
    if (longTermTrend && longTermTrend.value !== null && longTermTrend.pct !== null) {
      const lyPct = Math.abs(longTermTrend.pct)
      const lySign = longTermTrend.value > 0 ? 'up' : 'down'
      const lyDirection = longTermTrend.value > 0 ? 'significantly higher' : 'significantly lower'
      const lyColor = longTermTrend.value > 0 ? 'text-red-600' : 'text-green-600'
      
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

  const content = (
    <div>
      <div className="pb-3 mb-3 border-b">
        <p className="text-base">
          {getExecutiveSummary()}
        </p>
      </div>
      <div>
        <div className={cn(
          isMobile
            ? 'flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin -mx-1 px-1'
            : 'grid md:grid-cols-2 lg:grid-cols-3 gap-6'
        )}>
          {comparisonCards.map((comparison) => {
            const { Icon, color } = getComparisonIcon(comparison.label)
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
                  <Icon className={cn('h-5 w-5', color)} />
                  <h3 className="font-semibold text-sm uppercase tracking-wide">{comparison.label}</h3>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Latest Month</p>
                  {changeAmount !== null ? (
                    isSpendingLess ? (
                      <div className="flex items-center gap-1.5">
                        <TrendingDown className="h-5 w-5 text-green-600" />
                        <p className="text-lg font-bold text-green-600">Spending Less</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="h-5 w-5 text-red-600" />
                        <p className="text-lg font-bold text-red-600">Spending More</p>
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
                        isSpendingLess ? 'text-green-600' : 'text-red-600'
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
                          isSpendingLess ? 'text-green-600' : 'text-red-600'
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
            Monthly Category Summary - {summaryData.categoryName} ({summaryData.monthLabel})
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
      <CardContent className="pt-0">
        {content}
      </CardContent>
    </Card>
  )
}
