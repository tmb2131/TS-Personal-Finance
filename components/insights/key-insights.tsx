'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Progress } from '@/components/ui/progress'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { getChartFontSizes } from '@/lib/chart-styles'
import { cn } from '@/utils/cn'
import { createClient } from '@/lib/supabase/client'
import { BudgetTarget, AnnualTrend, MonthlyTrend, HistoricalNetWorth, AccountBalance } from '@/lib/types'
import { CheckCircle2, XCircle, TrendingUp, TrendingDown, DollarSign, Target, Calendar, CalendarDays, AlertCircle, ChevronRight, GitCompare } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
  LabelList,
} from 'recharts'

export function KeyInsights() {
  const { currency, convertAmount, fxRate } = useCurrency()
  const isMobile = useIsMobile()
  const previousYear = new Date().getFullYear() - 1
  const [budgetData, setBudgetData] = useState<BudgetTarget[]>([])
  const [annualTrends, setAnnualTrends] = useState<AnnualTrend[]>([])
  const [monthlyTrends, setMonthlyTrends] = useState<MonthlyTrend[]>([])
  const [historicalNetWorth, setHistoricalNetWorth] = useState<HistoricalNetWorth[]>([])
  const [accountBalances, setAccountBalances] = useState<AccountBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      
      const [budgetResult, annualResult, monthlyResult, netWorthResult, accountsResult] = await Promise.all([
        supabase.from('budget_targets').select('*'),
        supabase.from('annual_trends').select('*'),
        supabase.from('monthly_trends').select('*'),
        supabase.from('historical_net_worth').select('*').order('date', { ascending: false }),
        supabase.from('account_balances').select('*').order('date_updated', { ascending: false }),
      ])

      // Check for errors
      const errors = [
        budgetResult.error,
        annualResult.error,
        monthlyResult.error,
        netWorthResult.error,
        accountsResult.error,
      ].filter(Boolean)

      if (errors.length > 0) {
        console.error('Errors fetching insights data:', errors)
        setError('Failed to load some insights data. Please try refreshing the page.')
      } else {
        setError(null)
      }

      if (budgetResult.data) setBudgetData(budgetResult.data as BudgetTarget[])
      if (annualResult.data) setAnnualTrends(annualResult.data as AnnualTrend[])
      if (monthlyResult.data) setMonthlyTrends(monthlyResult.data as MonthlyTrend[])
      if (netWorthResult.data) setHistoricalNetWorth(netWorthResult.data as HistoricalNetWorth[])
      if (accountsResult.data) {
        // Get most recent balance for each account
        const accountsMap = new Map<string, AccountBalance>()
        accountsResult.data.forEach((account: AccountBalance) => {
          const key = `${account.institution}-${account.account_name}`
          const existing = accountsMap.get(key)
          if (!existing || new Date(account.date_updated) > new Date(existing.date_updated)) {
            accountsMap.set(key, account)
          }
        })
        setAccountBalances(Array.from(accountsMap.values()))
      }

      setLoading(false)
    }

    fetchData()
  }, [])

  // Filter out income categories (for budget and trends)
  const expenseCategories = useMemo(() => {
    return ['Income', 'Gift Money']
  }, [])

  // Same exclusions as Daily Summary modal for "annual spend" (est. spend from budget forecast)
  const EXCLUDED_ANNUAL_SPEND = ['Income', 'Gift Money', 'Other Income', 'Excluded']

  // Check if there's any Trust data
  const hasTrustData = useMemo(() => {
    // Check account balances for Trust category
    const hasTrustAccounts = accountBalances.some(
      (account) => account.category === 'Trust' && Math.abs(account.balance_total_local) > 0
    )
    // Check historical net worth for Trust category
    const hasTrustNetWorth = historicalNetWorth.some(
      (item) => item.category === 'Trust' && Math.abs(currency === 'USD' ? (item.amount_usd ?? 0) : (item.amount_gbp ?? 0)) > 0
    )
    return hasTrustAccounts || hasTrustNetWorth
  }, [accountBalances, historicalNetWorth, currency])

  // Net Worth Insights
  const netWorthInsights = useMemo(() => {
    // Calculate current net worth from account balances (same method as Dashboard AccountsOverview)
    // Use the exact same calculation as the Dashboard's grandTotals
    // IMPORTANT: Trust is NOT included in Family (same as Dashboard)
    const categorySummary = accountBalances.reduce((acc: any, account) => {
      const category = account.category
      if (!acc[category]) {
        acc[category] = { personal: 0, family: 0, total: 0 }
      }
      
      const personalAmount = convertAmount(account.balance_personal_local, account.currency, fxRate)
      const familyAmount = convertAmount(account.balance_family_local, account.currency, fxRate)
      const totalAmount = convertAmount(account.balance_total_local, account.currency, fxRate)
      
      acc[category].personal += personalAmount
      acc[category].family += familyAmount
      acc[category].total += totalAmount
      
      return acc
    }, {})

    // Calculate grand totals (same as Dashboard)
    // Exclude Trust from Family calculation
    const grandTotals = Object.entries(categorySummary).reduce(
      (acc: any, [category, item]: [string, any]) => {
        acc.personal += item.personal
        // Only include Family if category is NOT Trust
        if (category !== 'Trust') {
          acc.family += item.family
        }
        acc.total += item.total
        return acc
      },
      { personal: 0, family: 0, total: 0 }
    )

    const currentPersonal = grandTotals.personal
    const currentFamily = grandTotals.family

    const currentTotal = currentPersonal + currentFamily

    // Get historical net worth data grouped by year
    const currentYear = new Date().getFullYear()
    const lastYear = currentYear - 1
    
    const netWorthByYear = historicalNetWorth.reduce((acc: any, item: HistoricalNetWorth) => {
      const year = new Date(item.date).getFullYear()
      const amount = currency === 'USD' ? item.amount_usd : item.amount_gbp
      
      if (!acc[year]) {
        acc[year] = { Personal: 0, Family: 0, Total: 0, dates: [] }
      }
      
      if (item.category === 'Personal') {
        acc[year].Personal += amount || 0
      } else if (item.category === 'Family') {
        acc[year].Family += amount || 0
      }
      acc[year].Total += amount || 0
      acc[year].dates.push(new Date(item.date))
      
      return acc
    }, {})

    // For comparison, get the most recent historical net worth entry for last year
    // IMPORTANT: Exclude Trust from historical data to match current calculation
    // Get the most recent Personal value for last year
    const lastYearPersonalEntries = historicalNetWorth
      .filter((item: HistoricalNetWorth) => {
        const year = new Date(item.date).getFullYear()
        return year === lastYear && item.category === 'Personal'
      })
      .sort((a: HistoricalNetWorth, b: HistoricalNetWorth) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      )
    
    const lastYearPersonal = lastYearPersonalEntries.length > 0
      ? (currency === 'USD' ? lastYearPersonalEntries[0].amount_usd : lastYearPersonalEntries[0].amount_gbp) || 0
      : 0
    
    // Get the most recent Family value for last year (excluding Trust)
    const lastYearFamilyEntries = historicalNetWorth
      .filter((item: HistoricalNetWorth) => {
        const year = new Date(item.date).getFullYear()
        return year === lastYear && item.category === 'Family'
      })
      .sort((a: HistoricalNetWorth, b: HistoricalNetWorth) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      )
    
    const lastYearFamily = lastYearFamilyEntries.length > 0
      ? (currency === 'USD' ? lastYearFamilyEntries[0].amount_usd : lastYearFamilyEntries[0].amount_gbp) || 0
      : 0
    
    // Calculate last year's total (Personal + Family, excluding Trust) to match current calculation
    const lastYearTotal = lastYearPersonal + lastYearFamily
    
    // Calculate 5-year average (current year - 1 through current year - 5)
    // IMPORTANT: Exclude Trust from each year's calculation, use most recent entry per category per year
    const yearsForAvg = [currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4, currentYear - 5]
    const fiveYearAvg = yearsForAvg.reduce((sum, year) => {
      // Get most recent Personal entry for this year
      const yearPersonalEntries = historicalNetWorth
        .filter((item: HistoricalNetWorth) => {
          const itemYear = new Date(item.date).getFullYear()
          return itemYear === year && item.category === 'Personal'
        })
        .sort((a: HistoricalNetWorth, b: HistoricalNetWorth) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        )
      
      const yearPersonal = yearPersonalEntries.length > 0
        ? (currency === 'USD' ? yearPersonalEntries[0].amount_usd : yearPersonalEntries[0].amount_gbp) || 0
        : 0
      
      // Get most recent Family entry for this year (excluding Trust)
      const yearFamilyEntries = historicalNetWorth
        .filter((item: HistoricalNetWorth) => {
          const itemYear = new Date(item.date).getFullYear()
          return itemYear === year && item.category === 'Family'
        })
        .sort((a: HistoricalNetWorth, b: HistoricalNetWorth) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        )
      
      const yearFamily = yearFamilyEntries.length > 0
        ? (currency === 'USD' ? yearFamilyEntries[0].amount_usd : yearFamilyEntries[0].amount_gbp) || 0
        : 0
      
      return sum + (yearPersonal + yearFamily)
    }, 0) / 5

    // Calculate changes (comparing Personal + Family, excluding Trust)
    const vsLastYear = currentTotal - lastYearTotal
    const vsFiveYearAvg = currentTotal - fiveYearAvg

    // Calculate percentage change vs last year
    const vsLastYearPercent = lastYearTotal !== 0 
      ? (vsLastYear / Math.abs(lastYearTotal)) * 100 
      : 0

    // Calculate Personal vs Family changes using the most recent historical data
    const personalVsLastYear = currentPersonal - lastYearPersonal
    const familyVsLastYear = currentFamily - lastYearFamily

    // Calculate top accounts by balance (from account balances)
    const topAccounts = accountBalances
      .map((account) => {
        const totalBalance = convertAmount(account.balance_total_local, account.currency, fxRate)
        return {
          institution: account.institution,
          accountName: account.account_name,
          balance: totalBalance,
        }
      })
      .filter((item) => Math.abs(item.balance) > 1000) // Only significant amounts
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
      .slice(0, 6) // Top 6 accounts

    // Net worth over time: last 12 months by month (exclude Trust)
    const byMonth = historicalNetWorth.reduce<Record<string, { personal: number; family: number }>>((acc, item) => {
      const d = new Date(item.date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const amount = currency === 'USD' ? (item.amount_usd || 0) : (item.amount_gbp || 0)
      if (!acc[key]) acc[key] = { personal: 0, family: 0 }
      if (item.category === 'Personal') acc[key].personal += amount
      else if (item.category === 'Family') acc[key].family += amount
      return acc
    }, {})
    const netWorthChartData = Object.entries(byMonth)
      .map(([month, v]) => ({
        month,
        total: v.personal + v.family,
        Personal: v.personal,
        Family: v.family,
      }))
      .filter((d) => d.total > 0) // Only display months/years where total net worth > 0 (per PRD requirement)
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
      .map((d, idx, arr) => {
        // Format label: show year for January months (start of year) and for first item, abbreviated month for others
        const [year, month] = d.month.split('-')
        const monthNum = parseInt(month, 10)
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        
        // Track previous year to detect year changes
        const prevItem = idx > 0 ? arr[idx - 1] : null
        const prevYear = prevItem ? prevItem.month.split('-')[0] : null
        const isYearStart = monthNum === 1 || year !== prevYear
        const isFirst = idx === 0
        
        let label: string
        if (isYearStart || isFirst) {
          // Show year for January months (start of year) and first item
          label = year
        } else {
          // Show abbreviated month for other months
          label = monthNames[monthNum - 1]
        }
        
        return {
          ...d,
          label,
          year, // Keep year for reference
          monthNum, // Keep month number for reference
          isYearTick: isYearStart || isFirst, // Flag to identify year ticks
        }
      })

    // Check if there's a Personal/Family split
    const hasPersonalFamilySplit = currentFamily > 0

    // Category colors for pie chart
    const categoryColors: Record<string, string> = {
      'Cash': '#22c55e', // Green-500
      'Brokerage': '#3b82f6', // Blue-500
      'Alt Inv': '#8b5cf6', // Violet-500
      'Retirement': '#ef4444', // Red-500
      'Taconic': '#f59e0b', // Amber-500
      'House': '#64748b', // Slate-500
      'Trust': '#8b5cf6', // Violet-500
    }

    // Personal vs Family for donut (current snapshot) - only if there's a split
    const personalVsFamilyPie = hasPersonalFamilySplit
      ? [
          { name: 'Personal', value: Math.max(0, currentPersonal), fill: '#3b82f6' },
          { name: 'Family', value: Math.max(0, currentFamily), fill: '#8b5cf6' },
        ].filter((d) => d.value > 0)
      : []

    // Category breakdown for donut (when no Personal/Family split)
    // Exclude Trust from category breakdown
    const categoryPie = !hasPersonalFamilySplit
      ? Object.entries(categorySummary)
          .filter(([category]) => category !== 'Trust') // Exclude Trust
          .map(([category, item]: [string, any]) => ({
            name: category,
            value: Math.max(0, item.total),
            fill: categoryColors[category] || '#6b7280', // Default gray if category not in map
          }))
          .filter((d) => d.value > 0)
          .sort((a, b) => b.value - a.value) // Sort by value descending
      : []

    return {
      currentTotal,
      currentPersonal,
      currentFamily,
      vsLastYear,
      vsLastYearPercent,
      vsFiveYearAvg,
      personalVsLastYear,
      familyVsLastYear,
      topAccounts,
      lastYearTotal,
      netWorthChartData,
      personalVsFamilyPie,
      categoryPie,
      hasPersonalFamilySplit,
    }
  }, [accountBalances, historicalNetWorth, currency, fxRate, convertAmount])

  const formatCurrency = (value: number) => {
    const valueInK = Math.abs(value) / 1000
    const currencySymbol = currency === 'USD' ? '$' : '£'
    // Round to nearest integer, but show at least 1 decimal if less than 10k
    if (valueInK < 10) {
      return `${currencySymbol}${valueInK.toFixed(1)}k`
    }
    return `${currencySymbol}${Math.round(valueInK)}k`
  }

  const formatCurrencyLarge = (value: number) => {
    const valueInM = Math.abs(value) / 1000000
    const currencySymbol = currency === 'USD' ? '$' : '£'
    if (valueInM >= 1) {
      return `${currencySymbol}${valueInM.toFixed(1)}M`
    }
    return formatCurrency(value)
  }

  const formatPercent = (value: number) => {
    const absValue = Math.abs(value)
    if (absValue < 0.1) {
      return '<0.1%'
    }
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
  }

  const formatPercentAbs = (value: number) => {
    const absValue = Math.abs(value)
    if (absValue < 0.1) {
      return '<0.1%'
    }
    return `${absValue.toFixed(1)}%`
  }

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    if (!element) return
    const main = document.querySelector('main')
    if (!main) {
      const y = element.getBoundingClientRect().top + window.pageYOffset - 100
      window.scrollTo({ top: y, behavior: 'smooth' })
      return
    }
    const headerOffset = 100
    const elRect = element.getBoundingClientRect()
    const mainRect = main.getBoundingClientRect()
    const relativeTop = elRect.top - mainRect.top + main.scrollTop
    main.scrollTo({ top: relativeTop - headerOffset, behavior: 'smooth' })
  }

  // Annual Budget Insights — always use GBP from data; convert to USD with current FX when currency is USD
  const annualBudgetInsights = useMemo(() => {
    const expenses = budgetData.filter((b) => !expenseCategories.includes(b.category))

    const totalBudget = expenses.reduce((sum, b) => {
      const budgetGbp = Math.abs(b.annual_budget_gbp)
      const budget = currency === 'USD' ? convertAmount(budgetGbp, 'GBP', fxRate) : budgetGbp
      return sum + budget
    }, 0)

    const totalTracking = expenses.reduce((sum, b) => {
      const trackingGbp = Math.abs(b.tracking_est_gbp)
      const tracking = currency === 'USD' ? convertAmount(trackingGbp, 'GBP', fxRate) : trackingGbp
      return sum + tracking
    }, 0)

    const overallGap = totalTracking - totalBudget

    // Calculate gap per category (always from GBP, convert when USD)
    const categoryGaps = expenses
      .map((b) => {
        const budgetGbp = Math.abs(b.annual_budget_gbp)
        const trackingGbp = Math.abs(b.tracking_est_gbp)
        const budget = currency === 'USD' ? convertAmount(budgetGbp, 'GBP', fxRate) : budgetGbp
        const tracking = currency === 'USD' ? convertAmount(trackingGbp, 'GBP', fxRate) : trackingGbp
        const gap = tracking - budget
        return {
          category: b.category,
          gap,
          budget,
          tracking,
        }
      })
      .filter((item) => Math.abs(item.gap) > 100) // Only show significant gaps
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))

    const underBudget = categoryGaps.filter((item) => item.gap < 0)
    const overBudget = categoryGaps.filter((item) => item.gap > 0)

    // Calculate excluding Holidays
    const holidaysGap = categoryGaps.find((item) => item.category === 'Holidays')?.gap || 0
    const gapExcludingHolidays = overallGap - holidaysGap

    // Calculate percentage change vs budget
    const gapPercent = totalBudget !== 0 
      ? (overallGap / totalBudget) * 100 
      : 0

    return {
      overallGap,
      gapPercent,
      gapExcludingHolidays,
      totalBudget,
      totalTracking,
      underBudget: underBudget.slice(0, 5), // Top 5
      overBudget: overBudget.slice(0, 5), // Top 5
    }
  }, [budgetData, currency, expenseCategories, fxRate, convertAmount])

  // Annual Spend Insights — use same source as Daily Summary: budget_targets.tracking_est_gbp (est. annual spend)
  const annualSpendInsights = useMemo(() => {
    const mult = currency === 'USD' ? fxRate : 1

    // This year: from budget forecast (same as Daily Summary modal) so both places show the same number
    const budgetExpenses = budgetData.filter((b) => !EXCLUDED_ANNUAL_SPEND.includes(b.category))
    const trackingEstTotalGbp = budgetExpenses.reduce((sum, b) => sum + Math.abs(b.tracking_est_gbp ?? 0), 0)
    const currentYearEstDisplay = trackingEstTotalGbp * mult

    // Historical comparison: from annual_trends (same category exclusions)
    const trendExpenses = annualTrends.filter((a) => !EXCLUDED_ANNUAL_SPEND.includes(a.category))
    const lastYear = trendExpenses.reduce((sum, a) => sum + a.cur_yr_minus_1, 0)
    const fourYearAvg = trendExpenses.reduce((sum, a) => {
      const avg = (a.cur_yr_minus_4 + a.cur_yr_minus_3 + a.cur_yr_minus_2 + a.cur_yr_minus_1) / 4
      return sum + avg
    }, 0)

    // annual_trends uses negative values for expenses; compare with tracking total (positive) as -trackingEstTotalGbp
    const currentYearSignedGbp = -trackingEstTotalGbp
    const vsFourYearAvgGbp = currentYearSignedGbp - fourYearAvg // Positive = spending less
    const vsLastYearGbp = currentYearSignedGbp - lastYear
    const vsFourYearAvg = vsFourYearAvgGbp * mult
    const vsLastYear = vsLastYearGbp * mult

    // Calculate percentage change vs 4-year average (unchanged by currency)
    const vsFourYearAvgPercent = fourYearAvg !== 0
      ? (vsFourYearAvgGbp / Math.abs(fourYearAvg)) * 100
      : 0

    // Per-category differences from trends (same exclusions)
    const categoryDiffs = trendExpenses
      .map((a) => {
        const curEst = a.cur_yr_est
        const lastYr = a.cur_yr_minus_1
        const avg = (a.cur_yr_minus_4 + a.cur_yr_minus_3 + a.cur_yr_minus_2 + a.cur_yr_minus_1) / 4
        return {
          category: a.category,
          vsFourYearAvg: (curEst - avg) * mult,
          vsLastYear: (curEst - lastYr) * mult,
        }
      })
      .filter((item) => Math.abs(item.vsFourYearAvg) > (1000 * mult))
      .sort((a, b) => Math.abs(b.vsFourYearAvg) - Math.abs(a.vsFourYearAvg))

    const spendingLess = categoryDiffs.filter((item) => item.vsFourYearAvg > 0).slice(0, 5)
    const spendingMore = categoryDiffs.filter((item) => item.vsFourYearAvg < 0).slice(0, 5)

    return {
      currentYearEstDisplay,
      vsFourYearAvg,
      vsFourYearAvgPercent,
      vsLastYear,
      spendingLess,
      spendingMore,
    }
  }, [annualTrends, budgetData, currency, fxRate])

  // Monthly Spend Insights — values in GBP from monthly_trends; convert to USD with current FX when currency is USD
  const monthlySpendInsights = useMemo(() => {
    const expenses = monthlyTrends.filter((m) => !expenseCategories.includes(m.category))
    const mult = currency === 'USD' ? fxRate : 1

    // Values are negative for expenses
    const currentMonthEst = expenses.reduce((sum, m) => sum + m.cur_month_est, 0)
    const ttmAvg = expenses.reduce((sum, m) => sum + m.ttm_avg, 0)

    // Positive = spending less (less negative)
    const vsTtmAvgGbp = currentMonthEst - ttmAvg
    const vsTtmAvg = vsTtmAvgGbp * mult

    // Calculate percentage change vs TTM average (unchanged by currency)
    const vsTtmAvgPercent = ttmAvg !== 0 
      ? (vsTtmAvgGbp / Math.abs(ttmAvg)) * 100 
      : 0

    // Calculate per-category differences (convert to display currency)
    const categoryDiffs = expenses
      .map((m) => {
        const curEst = m.cur_month_est
        const avg = m.ttm_avg
        return {
          category: m.category,
          diff: (curEst - avg) * mult,
        }
      })
      .filter((item) => Math.abs(item.diff) > (100 * mult))
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))

    const spendingMore = categoryDiffs.filter((item) => item.diff < 0).slice(0, 5)
    const spendingLess = categoryDiffs.filter((item) => item.diff > 0).slice(0, 5)

    // Estimated spend this month (absolute, display currency)
    const currentMonthEstDisplay = Math.abs(currentMonthEst) * mult

    return {
      currentMonthEstDisplay,
      vsTtmAvg,
      vsTtmAvgPercent,
      spendingMore,
      spendingLess,
    }
  }, [monthlyTrends, expenseCategories, currency, fxRate])

  if (loading) {
    return (
      <div className="space-y-8">
        {/* Executive Summary Skeleton */}
        <Card className="border-2">
          <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-3 p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-5 rounded" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <div className="space-y-2">
                    <div>
                      <Skeleton className="h-3 w-20 mb-1" />
                      <Skeleton className="h-8 w-32" />
                    </div>
                    <div className="space-y-1 pt-2 border-t">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Net Worth Section Skeleton */}
        <Card>
          <CardHeader className="bg-muted/50">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-3 w-64 mt-1" />
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="h-5 w-5 rounded-full mt-0.5" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            </div>
            <div className="grid md:grid-cols-2 gap-6 pt-4">
              {[1, 2].map((i) => (
                <div key={i}>
                  <Skeleton className="h-4 w-24 mb-3 pb-2 border-b" />
                  <ul className="space-y-1.5">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </ul>
                </div>
              ))}
            </div>
            <div className="pt-4">
              <Skeleton className="h-4 w-32 mb-3 pb-2 border-b" />
              <ul className="space-y-1.5">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Other Sections Skeleton */}
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="bg-muted/50">
              <Skeleton className="h-6 w-40" />
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-3">
                {[1, 2].map((j) => (
                  <div key={j} className="flex items-start gap-3">
                    <Skeleton className="h-5 w-5 rounded-full mt-0.5" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
              <div className="grid md:grid-cols-2 gap-6 pt-4">
                {[1, 2].map((j) => (
                  <div key={j}>
                    <Skeleton className="h-4 w-32 mb-3 pb-2 border-b" />
                    <ul className="space-y-1.5">
                      {[1, 2, 3].map((k) => (
                        <Skeleton key={k} className="h-4 w-full" />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Key Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={AlertCircle}
            title="Error loading insights"
            description={error}
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-8">
      {/* Executive Summary */}
      <Card id="executive-summary" className="border-2 scroll-mt-24">
        <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30">
          <CardTitle className="text-2xl font-bold">Executive Summary</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Key takeaways at a glance — click a card to jump to the section</p>
        </CardHeader>
        <CardContent className="pt-6">
          <div className={isMobile
            ? 'flex gap-4 overflow-x-auto pt-2 pb-2 snap-x snap-mandatory scrollbar-thin -mx-1 px-1'
            : 'grid md:grid-cols-2 lg:grid-cols-4 gap-6'
          }>
            {/* Net Worth Summary — clickable to scroll to section */}
            <button
              type="button"
              onClick={() => scrollToSection('net-worth')}
              className={cn(
                'space-y-3 p-4 rounded-lg border bg-card shrink-0 text-left w-full cursor-pointer transition-all',
                'hover:shadow-md hover:border-primary/50 hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                isMobile && 'min-w-[85%] max-w-[85%] snap-center'
              )}
              aria-label="Net worth summary, jump to Net Worth section"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                  <h3 className="font-semibold text-sm uppercase tracking-wide">Net Worth</h3>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Current Value {hasTrustData && <span className="text-[11px]">(Trust excluded)</span>}
                  </p>
                  <p className="text-2xl font-bold tabular-nums">{formatCurrencyLarge(netWorthInsights.currentTotal)}</p>
                </div>
                <div className="space-y-1 pt-2 border-t">
                  <div className="flex items-center gap-2">
                    {netWorthInsights.vsLastYear > 0 ? (
                      <>
                        <TrendingUp className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-semibold text-green-600">
                          +{formatCurrencyLarge(Math.abs(netWorthInsights.vsLastYear))}
                        </span>
                      </>
                    ) : (
                      <>
                        <TrendingDown className="h-4 w-4 text-red-600" />
                        <span className="text-sm font-semibold text-red-600">
                          {formatCurrencyLarge(netWorthInsights.vsLastYear)}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${netWorthInsights.vsLastYear > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatPercent(netWorthInsights.vsLastYearPercent)}
                    </span>
                    <span className="text-xs text-muted-foreground">vs year-end {previousYear}</span>
                  </div>
                </div>
              </div>
            </button>

            {/* Annual Budget Summary — clickable to scroll to section */}
            <button
              type="button"
              onClick={() => scrollToSection('annual-budget')}
              className={cn(
                'space-y-3 p-4 rounded-lg border bg-card shrink-0 text-left w-full cursor-pointer transition-all',
                'hover:shadow-md hover:border-primary/50 hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                isMobile && 'shrink-0 min-w-[85%] max-w-[85%] snap-center'
              )}
              aria-label="Annual budget summary, jump to Annual Budget section"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-purple-600" />
                  <h3 className="font-semibold text-sm uppercase tracking-wide">Annual Budget</h3>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">vs Annual Spend</p>
                  {annualBudgetInsights.overallGap < 0 ? (
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
                    <span className={cn('font-semibold', annualBudgetInsights.overallGap < 0 ? 'text-green-600' : 'text-red-600')}>
                      {formatCurrency(Math.abs(annualBudgetInsights.overallGap))}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">
                      {annualBudgetInsights.overallGap < 0 ? 'under' : 'over'} budget
                    </span>
                  </p>
                  <p className="text-xs">
                    <span className={`font-medium ${annualBudgetInsights.overallGap < 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatPercentAbs(annualBudgetInsights.gapPercent)}
                    </span>
                    <span className="text-muted-foreground ml-1">
                      {annualBudgetInsights.overallGap < 0 ? 'under' : 'over'} budget
                    </span>
                  </p>
                </div>
              </div>
            </button>

            {/* Annual Spend Summary — clickable to scroll to section */}
            <button
              type="button"
              onClick={() => scrollToSection('annual-spend')}
              className={cn(
                'space-y-3 p-4 rounded-lg border bg-card shrink-0 text-left w-full cursor-pointer transition-all',
                'hover:shadow-md hover:border-primary/50 hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                isMobile && 'shrink-0 min-w-[85%] max-w-[85%] snap-center'
              )}
              aria-label="Annual spend summary, jump to Annual Spend section"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-orange-600" />
                  <h3 className="font-semibold text-sm uppercase tracking-wide">Annual Spend</h3>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">vs 4-Year Average</p>
                  {annualSpendInsights.vsFourYearAvg > 0 ? (
                    <div className="flex items-center gap-2">
                      <TrendingDown className="h-5 w-5 text-green-600" />
                      <p className="text-lg font-bold text-green-600">Spending Less</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-red-600" />
                      <p className="text-lg font-bold text-red-600">Spending More</p>
                    </div>
                  )}
                </div>
                <div className="space-y-1 pt-2 border-t">
                  <p className="text-sm">
                    <span className={cn('font-semibold', annualSpendInsights.vsFourYearAvg > 0 ? 'text-green-600' : 'text-red-600')}>
                      {formatCurrency(Math.abs(annualSpendInsights.vsFourYearAvg))}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">
                      {annualSpendInsights.vsFourYearAvg > 0 ? 'less' : 'more'} than average
                    </span>
                  </p>
                  <p className="text-xs">
                    <span className={`font-medium ${annualSpendInsights.vsFourYearAvg > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatPercentAbs(annualSpendInsights.vsFourYearAvgPercent)}
                    </span>
                    <span className="text-muted-foreground ml-1">
                      {annualSpendInsights.vsFourYearAvg > 0 ? 'less' : 'more'} than average
                    </span>
                  </p>
                </div>
              </div>
            </button>

            {/* Monthly Spend Summary — clickable to scroll to section */}
            <button
              type="button"
              onClick={() => scrollToSection('monthly-spend')}
              className={cn(
                'space-y-3 p-4 rounded-lg border bg-card shrink-0 text-left w-full cursor-pointer transition-all',
                'hover:shadow-md hover:border-primary/50 hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                isMobile && 'shrink-0 min-w-[85%] max-w-[85%] snap-center'
              )}
              aria-label="Monthly spend summary, jump to Monthly Spend section"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-indigo-600" />
                  <h3 className="font-semibold text-sm uppercase tracking-wide">Monthly Spend</h3>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">vs TTM Average</p>
                  {monthlySpendInsights.vsTtmAvg > 0 ? (
                    <div className="flex items-center gap-2">
                      <TrendingDown className="h-5 w-5 text-green-600" />
                      <p className="text-lg font-bold text-green-600">Spending Less</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-red-600" />
                      <p className="text-lg font-bold text-red-600">Spending More</p>
                    </div>
                  )}
                </div>
                <div className="space-y-1 pt-2 border-t">
                  <p className="text-sm">
                    <span className={cn('font-semibold', monthlySpendInsights.vsTtmAvg > 0 ? 'text-green-600' : 'text-red-600')}>
                      {formatCurrency(Math.abs(monthlySpendInsights.vsTtmAvg))}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">
                      {monthlySpendInsights.vsTtmAvg > 0 ? 'less' : 'more'} than average
                    </span>
                  </p>
                  <p className="text-xs">
                    <span className={`font-medium ${monthlySpendInsights.vsTtmAvg > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatPercentAbs(monthlySpendInsights.vsTtmAvgPercent)}
                    </span>
                    <span className="text-muted-foreground ml-1">
                      {monthlySpendInsights.vsTtmAvg > 0 ? 'less' : 'more'} than average
                    </span>
                  </p>
                </div>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Net Worth Section */}
      <Card id="net-worth" className="scroll-mt-24">
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Net Worth</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Current net worth is <span className="font-semibold">{formatCurrencyLarge(netWorthInsights.currentTotal)}</span>
            {hasTrustData && ' (Trust excluded)'}.
          </p>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {/* Vs last year — prominent */}
          <div className="space-y-1.5 rounded-lg border bg-card p-2.5 w-full lg:w-[calc((100%-3*1.5rem)/4)]">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Vs year-end {previousYear}</p>
              {netWorthInsights.vsLastYear > 0 ? (
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  <p className="text-lg font-bold text-green-600">Increased</p>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <TrendingDown className="h-5 w-5 text-red-600" />
                  <p className="text-lg font-bold text-red-600">Decreased</p>
                </div>
              )}
            </div>
            <div className="space-y-1 pt-1.5 border-t">
              <p className="text-sm">
                <span className={cn('font-semibold', netWorthInsights.vsLastYear > 0 ? 'text-green-600' : 'text-red-600')}>
                  {netWorthInsights.vsLastYear > 0 ? '+' : ''}{formatCurrencyLarge(Math.abs(netWorthInsights.vsLastYear))}
                </span>
                <span className="text-xs text-muted-foreground ml-1">
                  {netWorthInsights.vsLastYear > 0 ? 'increase' : 'decrease'} vs year-end {previousYear}
                </span>
              </p>
              <p className="text-xs">
                <span className={`font-medium ${netWorthInsights.vsLastYear > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatPercent(netWorthInsights.vsLastYearPercent)}
                </span>
                <span className="text-muted-foreground ml-1">
                  {netWorthInsights.vsLastYear > 0 ? 'increase' : 'decrease'} vs year-end {previousYear}
                </span>
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Net worth over time — small line chart */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Net worth over time</h3>
              {netWorthInsights.netWorthChartData.length > 0 ? (
                <div className="h-[180px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={netWorthInsights.netWorthChartData} margin={{ top: 25, right: isMobile ? 10 : 15, left: 0, bottom: isMobile ? 25 : 15 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: getChartFontSizes(isMobile).axisTick, fontWeight: 600 }}
                        interval={0}
                        angle={isMobile ? -45 : 0}
                        textAnchor={isMobile ? 'end' : 'middle'}
                        height={isMobile ? 50 : 35}
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={(value, index) => {
                          // Always show year labels, show month labels for context
                          const data = netWorthInsights.netWorthChartData[index]
                          if (data && data.isYearTick) {
                            return value // Year labels (4 digits) - always show
                          }
                          return value // Month abbreviations
                        }}
                      />
                      <YAxis
                        tick={{ fontSize: getChartFontSizes(isMobile).axisTick, fontWeight: 400 }}
                        tickFormatter={(v) => {
                          if (v === 0) return '0'
                          if (v >= 1e6) {
                            const m = v / 1e6
                            return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`
                          }
                          if (v >= 1000) {
                            const k = v / 1000
                            return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`
                          }
                          return String(v)
                        }}
                      />
                      <Tooltip 
                        formatter={(v: number) => [formatCurrencyLarge(v), 'Total']} 
                        labelFormatter={(label, payload) => {
                          if (!payload || payload.length === 0) return label
                          const data = payload[0].payload
                          if (data && data.month) {
                            const [year, month] = data.month.split('-')
                            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
                            return `${monthNames[parseInt(month, 10) - 1]} ${year}`
                          }
                          return label
                        }} 
                      />
                      <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={false}>
                        <LabelList
                          dataKey="total"
                          position="top"
                          offset={8}
                          content={({ x, y, value, index }: { x?: string | number; y?: string | number; value?: string | number; index?: number }) => {
                            if (value == null || x == null || y == null || typeof x === 'string' || typeof y === 'string' || typeof value === 'string') return null
                            const data = netWorthInsights.netWorthChartData
                            const isFirst = index === 0
                            const isLast = index === data.length - 1
                            // Find peak index (highest total)
                            const peakIndex = data.reduce((maxIdx, item, i) => item.total > data[maxIdx].total ? i : maxIdx, 0)
                            const isPeak = index === peakIndex
                            // Only label first, last, and peak points
                            if (!isFirst && !isLast && !isPeak) return null
                            return (
                              <text
                                key={index}
                                x={x}
                                y={y - 8}
                                textAnchor={isFirst ? 'start' : isLast ? 'end' : 'middle'}
                                fontSize={getChartFontSizes(isMobile).axisTick}
                                fill="#374151"
                              >
                                {formatCurrencyLarge(value)}
                              </text>
                            )
                          }}
                        />
                      </Line>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No historical data yet.</p>
              )}
            </div>

            {/* Personal vs Family or Category Breakdown — donut */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold">
                  {netWorthInsights.hasPersonalFamilySplit ? 'Personal vs Family' : 'Net Worth by Category'}
                </h3>
                {!netWorthInsights.hasPersonalFamilySplit && hasTrustData && (
                  <span className="text-xs text-muted-foreground">(Trust excluded)</span>
                )}
              </div>
              {(netWorthInsights.personalVsFamilyPie.length > 0 || netWorthInsights.categoryPie.length > 0) ? (
                <div className="h-[200px] w-full flex items-center justify-center pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 8, right: 10, bottom: 0, left: 10 }}>
                      <Pie
                        data={netWorthInsights.hasPersonalFamilySplit ? netWorthInsights.personalVsFamilyPie : netWorthInsights.categoryPie}
                        cx="50%"
                        cy="48%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                        stroke="#fff"
                        strokeWidth={1}
                      >
                        {(netWorthInsights.hasPersonalFamilySplit ? netWorthInsights.personalVsFamilyPie : netWorthInsights.categoryPie).map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) => formatCurrencyLarge(v)}
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          padding: isMobile ? '6px 10px' : '8px 12px',
                          fontSize: `${getChartFontSizes(isMobile).tooltipMin}px`,
                        }}
                      />
                      <Legend
                        wrapperStyle={{
                          paddingTop: isMobile ? '10px' : '20px',
                          fontSize: getChartFontSizes(isMobile).legend,
                        }}
                        iconType="square"
                        iconSize={getChartFontSizes(isMobile).iconSize}
                        formatter={(value) => (
                          <span style={{ fontSize: getChartFontSizes(isMobile).legend, marginRight: isMobile ? '16px' : '24px' }}>
                            {value}
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No balance data yet.</p>
              )}
            </div>
          </div>

          {/* Top Holdings — same style as Annual Budget (custom horizontal bars) */}
          <div>
            <h3 className="text-sm font-semibold mb-3 border-b pb-2">Top Holdings</h3>
            {netWorthInsights.topAccounts.length > 0 ? (
              (() => {
                const accounts = netWorthInsights.topAccounts
                const mid = Math.ceil(accounts.length / 2)
                const leftAccounts = accounts.slice(0, mid)
                const rightAccounts = accounts.slice(mid)
                const maxValue = Math.max(...accounts.map((a) => Math.abs(a.balance)), 1)
                const renderColumn = (list: typeof leftAccounts) => (
                  <div>
                    {list.map((a, index) => {
                      const pct = (Math.abs(a.balance) / maxValue) * 100
                      const isLast = index === list.length - 1
                      return (
                        <div 
                          key={`${a.institution}-${a.accountName}`} 
                          className={cn(
                            "flex items-center gap-2",
                            "min-h-[1.75rem]", // Minimum height to accommodate wrapped text while keeping compact
                            !isLast && "mb-2" // Reduced spacing between items for more compact layout
                          )}
                        >
                          <span className="text-sm w-[200px] shrink-0 break-words leading-tight">{a.accountName}</span>
                          <div className="flex-1 min-w-0 h-4 rounded bg-muted overflow-hidden shrink">
                            <div className="h-full bg-blue-500 rounded" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-medium w-16 text-right shrink-0 leading-tight">{formatCurrencyLarge(a.balance)}</span>
                        </div>
                      )
                    })}
                  </div>
                )
                if (rightAccounts.length === 0) {
                  return <div>{renderColumn(leftAccounts)}</div>
                }
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {renderColumn(leftAccounts)}
                    {renderColumn(rightAccounts)}
                  </div>
                )
              })()
            ) : (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <AlertCircle className="h-4 w-4" /> No accounts found. Sync account data to see balances.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Annual Budget Section */}
      <Card id="annual-budget" className="scroll-mt-24">
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Annual Budget</CardTitle>
          <div className="flex flex-col gap-2 mt-1 sm:flex-row sm:items-center sm:gap-2">
            <p className="text-sm text-muted-foreground">
              {annualBudgetInsights.overallGap < 0 ? 'Under' : 'Over'} budget by{' '}
              <span className={cn('font-semibold', annualBudgetInsights.overallGap < 0 ? 'text-green-600' : 'text-red-600')}>
                {formatCurrency(Math.abs(annualBudgetInsights.overallGap))}
              </span>
              {' '}vs {new Date().getFullYear()} budget.
            </p>
            <Link
              href="/analysis#forecast-evolution"
              className={cn(
                'inline-flex items-center gap-1.5 w-fit shrink-0 rounded-lg border bg-background px-3 py-2 text-sm font-medium shadow-sm',
                'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
              )}
              aria-label="View Forecast Evolution"
            >
              Forecast Evolution
              <GitCompare className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {/* Spend vs Budget — progress bar */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Annual spend vs budget</span>
              <span>
                {formatCurrency(annualBudgetInsights.totalTracking)} / {formatCurrency(annualBudgetInsights.totalBudget)}
              </span>
            </div>
            {annualBudgetInsights.overallGap > 0 &&
            annualBudgetInsights.totalTracking > 0 &&
            annualBudgetInsights.totalBudget > 0 ? (
              (() => {
                const budgetPct = (annualBudgetInsights.totalBudget / annualBudgetInsights.totalTracking) * 100
                return (
                  <div className="relative h-2 w-full rounded-full overflow-hidden">
                    <div className="absolute inset-0 rounded-full bg-red-100" aria-hidden />
                    <div
                      className="absolute inset-y-0 left-0 rounded-l-full bg-red-100"
                      style={{ width: `${budgetPct}%` }}
                      aria-hidden
                    />
                    <div
                      className="absolute inset-y-0 rounded-r-full bg-red-500"
                      style={{ left: `${budgetPct}%`, width: `${100 - budgetPct}%` }}
                      aria-hidden
                    />
                    <div
                      className="absolute top-0 bottom-0 w-0.5 min-w-[2px] bg-foreground/90 -translate-x-1/2 rounded z-10"
                      style={{ left: `${budgetPct}%` }}
                      title="Budget limit"
                      aria-hidden
                    />
                  </div>
                )
              })()
            ) : annualBudgetInsights.overallGap <= 0 ? (
              <Progress
                value={Math.min(100, (annualBudgetInsights.totalBudget > 0 ? (annualBudgetInsights.totalTracking / annualBudgetInsights.totalBudget) * 100 : 0))}
                className="[&>div]:bg-green-600"
              />
            ) : (
              <Progress value={100} className="[&>div]:bg-red-500" />
            )}
            <p className="text-xs text-muted-foreground mt-1">
              <span className={cn(annualBudgetInsights.overallGap < 0 ? 'text-green-600' : 'text-red-600')}>
                {formatPercentAbs(annualBudgetInsights.gapPercent)}
              </span>
              {' '}{annualBudgetInsights.overallGap < 0 ? 'under' : 'over'} budget
            </p>
          </div>

          {/* Under / Over budget — horizontal bars (shared scale across both cards) */}
          {/* Order tables dynamically: if under budget overall, show "Under budget" on left */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Under budget — show first if overall under budget */}
            {annualBudgetInsights.overallGap < 0 ? (
              <div>
                <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <h3 className="font-semibold text-sm">Under budget</h3>
                </div>
                {annualBudgetInsights.underBudget.length > 0 ? (
                  (() => {
                    const maxGap = Math.max(
                      ...annualBudgetInsights.underBudget.map((i) => Math.abs(i.gap)),
                      ...annualBudgetInsights.overBudget.map((i) => Math.abs(i.gap)),
                      1
                    )
                    return (
                      <div className="space-y-3">
                        {annualBudgetInsights.underBudget.map((item) => {
                          const pct = (Math.abs(item.gap) / maxGap) * 100
                          return (
                            <div key={item.category} className="flex items-center gap-2">
                              <span className="text-sm w-24 truncate">{item.category}</span>
                              <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                                <div className="h-full bg-green-500 rounded" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs font-medium text-green-600 w-14 text-right">{formatCurrency(Math.abs(item.gap))}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()
                ) : (
                  <p className="text-sm text-muted-foreground italic">No categories under budget</p>
                )}
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <h3 className="font-semibold text-sm">Over budget</h3>
                </div>
                {annualBudgetInsights.overBudget.length > 0 ? (
                  (() => {
                    const maxGap = Math.max(
                      ...annualBudgetInsights.underBudget.map((i) => Math.abs(i.gap)),
                      ...annualBudgetInsights.overBudget.map((i) => Math.abs(i.gap)),
                      1
                    )
                    return (
                      <div className="space-y-3">
                        {annualBudgetInsights.overBudget.map((item) => {
                          const pct = (Math.abs(item.gap) / maxGap) * 100
                          return (
                            <div key={item.category} className="flex items-center gap-2">
                              <span className="text-sm w-24 truncate">{item.category}</span>
                              <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                                <div className="h-full bg-red-500 rounded" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs font-medium text-red-600 w-14 text-right">{formatCurrency(Math.abs(item.gap))}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()
                ) : (
                  <p className="text-sm text-muted-foreground italic">No categories over budget</p>
                )}
              </div>
            )}
            {/* Over budget — show second if overall under budget, first if over budget */}
            {annualBudgetInsights.overallGap < 0 ? (
              <div>
                <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <h3 className="font-semibold text-sm">Over budget</h3>
                </div>
                {annualBudgetInsights.overBudget.length > 0 ? (
                  (() => {
                    const maxGap = Math.max(
                      ...annualBudgetInsights.underBudget.map((i) => Math.abs(i.gap)),
                      ...annualBudgetInsights.overBudget.map((i) => Math.abs(i.gap)),
                      1
                    )
                    return (
                      <div className="space-y-3">
                        {annualBudgetInsights.overBudget.map((item) => {
                          const pct = (Math.abs(item.gap) / maxGap) * 100
                          return (
                            <div key={item.category} className="flex items-center gap-2">
                              <span className="text-sm w-24 truncate">{item.category}</span>
                              <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                                <div className="h-full bg-red-500 rounded" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs font-medium text-red-600 w-14 text-right">{formatCurrency(Math.abs(item.gap))}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()
                ) : (
                  <p className="text-sm text-muted-foreground italic">No categories over budget</p>
                )}
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <h3 className="font-semibold text-sm">Under budget</h3>
                </div>
                {annualBudgetInsights.underBudget.length > 0 ? (
                  (() => {
                    const maxGap = Math.max(
                      ...annualBudgetInsights.underBudget.map((i) => Math.abs(i.gap)),
                      ...annualBudgetInsights.overBudget.map((i) => Math.abs(i.gap)),
                      1
                    )
                    return (
                      <div className="space-y-3">
                        {annualBudgetInsights.underBudget.map((item) => {
                          const pct = (Math.abs(item.gap) / maxGap) * 100
                          return (
                            <div key={item.category} className="flex items-center gap-2">
                              <span className="text-sm w-24 truncate">{item.category}</span>
                              <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                                <div className="h-full bg-green-500 rounded" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs font-medium text-green-600 w-14 text-right">{formatCurrency(Math.abs(item.gap))}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()
                ) : (
                  <p className="text-sm text-muted-foreground italic">No categories under budget</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Annual Spend Section */}
      <Card id="annual-spend" className="scroll-mt-24">
        <CardHeader className="bg-muted/50">
          <div className="flex flex-col gap-2 mt-1 sm:flex-row sm:items-center sm:gap-2">
            <div>
              <CardTitle className="text-xl">Annual Spend</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Est. this year (<span className="font-semibold">{formatCurrencyLarge(annualSpendInsights.currentYearEstDisplay)}</span>) vs 4-year average.
              </p>
            </div>
            <Link
              href="/#annual-trends"
              className={cn(
                'inline-flex items-center gap-1.5 w-fit shrink-0 rounded-lg border bg-background px-3 py-2 text-sm font-medium shadow-sm',
                'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
              )}
              aria-label="View Annual Trends on Dashboard"
            >
              Annual Trends
              <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {/* Vs 4-year average — prominent call-out */}
          <div className="space-y-1.5 rounded-lg border bg-card p-2.5 w-full lg:w-[calc((100%-3*1.5rem)/4)]">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Vs 4-year average</p>
              {annualSpendInsights.vsFourYearAvg > 0 ? (
                <div className="flex items-center gap-1.5">
                  <TrendingDown className="h-5 w-5 text-green-600" />
                  <p className="text-lg font-bold text-green-600">Spending Less</p>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-5 w-5 text-red-600" />
                  <p className="text-lg font-bold text-red-600">Spending More</p>
                </div>
              )}
            </div>
            <div className="space-y-1 pt-1.5 border-t">
              <p className="text-sm">
                <span className={cn('font-semibold', annualSpendInsights.vsFourYearAvg > 0 ? 'text-green-600' : 'text-red-600')}>
                  {formatCurrency(Math.abs(annualSpendInsights.vsFourYearAvg))}
                </span>
                <span className="text-xs text-muted-foreground ml-1">
                  {annualSpendInsights.vsFourYearAvg > 0 ? 'less' : 'more'} than average
                </span>
              </p>
              <p className="text-xs">
                <span className={`font-medium ${annualSpendInsights.vsFourYearAvg > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatPercentAbs(annualSpendInsights.vsFourYearAvgPercent)}
                </span>
                <span className="text-muted-foreground ml-1">
                  {annualSpendInsights.vsFourYearAvg > 0 ? 'less' : 'more'} than average
                </span>
              </p>
            </div>
          </div>

          {/* Order tables dynamically: if spending less overall, show "Spending less" on left */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Spending less vs average — show first if overall spending is less */}
            {annualSpendInsights.vsFourYearAvg > 0 ? (
              <div>
                <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <h3 className="font-semibold text-sm">Spending less vs average</h3>
                </div>
                {annualSpendInsights.spendingLess.length > 0 ? (
                  (() => {
                    const maxVal = Math.max(
                      ...annualSpendInsights.spendingLess.map((i) => Math.abs(i.vsFourYearAvg)),
                      ...annualSpendInsights.spendingMore.map((i) => Math.abs(i.vsFourYearAvg)),
                      1
                    )
                    return (
                      <div className="space-y-3">
                        {annualSpendInsights.spendingLess.map((item) => {
                          const pct = (Math.abs(item.vsFourYearAvg) / maxVal) * 100
                          return (
                            <div key={item.category} className="flex items-center gap-2">
                              <span className="text-sm w-24 truncate">{item.category}</span>
                              <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                                <div className="h-full bg-green-500 rounded" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs font-medium text-green-600 w-14 text-right">{formatCurrency(Math.abs(item.vsFourYearAvg))}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()
                ) : (
                  <p className="text-sm text-muted-foreground italic">No categories spending less than average</p>
                )}
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <h3 className="font-semibold text-sm">Spending more vs average</h3>
                </div>
                {annualSpendInsights.spendingMore.length > 0 ? (
                  (() => {
                    const maxVal = Math.max(
                      ...annualSpendInsights.spendingLess.map((i) => Math.abs(i.vsFourYearAvg)),
                      ...annualSpendInsights.spendingMore.map((i) => Math.abs(i.vsFourYearAvg)),
                      1
                    )
                    return (
                      <div className="space-y-3">
                        {annualSpendInsights.spendingMore.map((item) => {
                          const pct = (Math.abs(item.vsFourYearAvg) / maxVal) * 100
                          return (
                            <div key={item.category} className="flex items-center gap-2">
                              <span className="text-sm w-24 truncate">{item.category}</span>
                              <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                                <div className="h-full bg-red-500 rounded" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs font-medium text-red-600 w-14 text-right">{formatCurrency(Math.abs(item.vsFourYearAvg))}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()
                ) : (
                  <p className="text-sm text-muted-foreground italic">No categories spending more than average</p>
                )}
              </div>
            )}
            {/* Spending more vs average — show second if overall spending is less, first if spending more */}
            {annualSpendInsights.vsFourYearAvg > 0 ? (
              <div>
                <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <h3 className="font-semibold text-sm">Spending more vs average</h3>
                </div>
                {annualSpendInsights.spendingMore.length > 0 ? (
                  (() => {
                    const maxVal = Math.max(
                      ...annualSpendInsights.spendingLess.map((i) => Math.abs(i.vsFourYearAvg)),
                      ...annualSpendInsights.spendingMore.map((i) => Math.abs(i.vsFourYearAvg)),
                      1
                    )
                    return (
                      <div className="space-y-3">
                        {annualSpendInsights.spendingMore.map((item) => {
                          const pct = (Math.abs(item.vsFourYearAvg) / maxVal) * 100
                          return (
                            <div key={item.category} className="flex items-center gap-2">
                              <span className="text-sm w-24 truncate">{item.category}</span>
                              <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                                <div className="h-full bg-red-500 rounded" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs font-medium text-red-600 w-14 text-right">{formatCurrency(Math.abs(item.vsFourYearAvg))}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()
                ) : (
                  <p className="text-sm text-muted-foreground italic">No categories spending more than average</p>
                )}
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <h3 className="font-semibold text-sm">Spending less vs average</h3>
                </div>
                {annualSpendInsights.spendingLess.length > 0 ? (
                  (() => {
                    const maxVal = Math.max(
                      ...annualSpendInsights.spendingLess.map((i) => Math.abs(i.vsFourYearAvg)),
                      ...annualSpendInsights.spendingMore.map((i) => Math.abs(i.vsFourYearAvg)),
                      1
                    )
                    return (
                      <div className="space-y-3">
                        {annualSpendInsights.spendingLess.map((item) => {
                          const pct = (Math.abs(item.vsFourYearAvg) / maxVal) * 100
                          return (
                            <div key={item.category} className="flex items-center gap-2">
                              <span className="text-sm w-24 truncate">{item.category}</span>
                              <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                                <div className="h-full bg-green-500 rounded" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs font-medium text-green-600 w-14 text-right">{formatCurrency(Math.abs(item.vsFourYearAvg))}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()
                ) : (
                  <p className="text-sm text-muted-foreground italic">No categories spending less than average</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Monthly Spend Section */}
      <Card id="monthly-spend" className="scroll-mt-24">
        <CardHeader className="bg-muted/50">
          <div className="flex flex-col gap-2 mt-1 sm:flex-row sm:items-center sm:gap-2">
            <div>
              <CardTitle className="text-xl">Monthly Spend</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                This month (<span className="font-semibold">{formatCurrencyLarge(monthlySpendInsights.currentMonthEstDisplay)}</span>) vs trailing 12‑month average.
              </p>
            </div>
            <Link
              href="/#monthly-trends"
              className={cn(
                'inline-flex items-center gap-1.5 w-fit shrink-0 rounded-lg border bg-background px-3 py-2 text-sm font-medium shadow-sm',
                'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
              )}
              aria-label="View Monthly Trends on Dashboard"
            >
              Monthly Trends
              <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {/* Vs TTM — prominent */}
          <div className="space-y-1.5 rounded-lg border bg-card p-2.5 w-full lg:w-[calc((100%-3*1.5rem)/4)]">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Vs TTM average</p>
              {monthlySpendInsights.vsTtmAvg > 0 ? (
                <div className="flex items-center gap-1.5">
                  <TrendingDown className="h-5 w-5 text-green-600" />
                  <p className="text-lg font-bold text-green-600">Spending Less</p>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-5 w-5 text-red-600" />
                  <p className="text-lg font-bold text-red-600">Spending More</p>
                </div>
              )}
            </div>
            <div className="space-y-1 pt-1.5 border-t">
              <p className="text-sm">
                <span className={cn('font-semibold', monthlySpendInsights.vsTtmAvg > 0 ? 'text-green-600' : 'text-red-600')}>
                  {formatCurrency(Math.abs(monthlySpendInsights.vsTtmAvg))}
                </span>
                <span className="text-xs text-muted-foreground ml-1">
                  {monthlySpendInsights.vsTtmAvg > 0 ? 'less' : 'more'} than average
                </span>
              </p>
              <p className="text-xs">
                <span className={`font-medium ${monthlySpendInsights.vsTtmAvg > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatPercentAbs(monthlySpendInsights.vsTtmAvgPercent)}
                </span>
                <span className="text-muted-foreground ml-1">
                  {monthlySpendInsights.vsTtmAvg > 0 ? 'less' : 'more'} than average
                </span>
              </p>
            </div>
          </div>

          {/* Categories driving delta — same style as Annual Budget (shared scale) */}
          {/* Order tables dynamically: if spending less overall, show "Spending less" on left */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Spending less vs average — show first if overall spending is less */}
            {monthlySpendInsights.vsTtmAvg > 0 ? (
              <div>
                <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <h3 className="font-semibold text-sm">Spending less vs average</h3>
                </div>
                {monthlySpendInsights.spendingLess.length > 0 ? (
                  (() => {
                    const maxVal = Math.max(
                      ...monthlySpendInsights.spendingMore.map((i) => Math.abs(i.diff)),
                      ...monthlySpendInsights.spendingLess.map((i) => Math.abs(i.diff)),
                      1
                    )
                    return (
                      <div className="space-y-3">
                        {monthlySpendInsights.spendingLess.map((item) => {
                          const pct = (Math.abs(item.diff) / maxVal) * 100
                          return (
                            <div key={item.category} className="flex items-center gap-2">
                              <span className="text-sm w-24 truncate">{item.category}</span>
                              <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                                <div className="h-full bg-green-500 rounded" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs font-medium text-green-600 w-14 text-right">{formatCurrency(Math.abs(item.diff))}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()
                ) : (
                  <p className="text-sm text-muted-foreground italic">No categories spending less than average</p>
                )}
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <h3 className="font-semibold text-sm">Spending more vs average</h3>
                </div>
                {monthlySpendInsights.spendingMore.length > 0 ? (
                  (() => {
                    const maxVal = Math.max(
                      ...monthlySpendInsights.spendingMore.map((i) => Math.abs(i.diff)),
                      ...monthlySpendInsights.spendingLess.map((i) => Math.abs(i.diff)),
                      1
                    )
                    return (
                      <div className="space-y-3">
                        {monthlySpendInsights.spendingMore.map((item) => {
                          const pct = (Math.abs(item.diff) / maxVal) * 100
                          return (
                            <div key={item.category} className="flex items-center gap-2">
                              <span className="text-sm w-24 truncate">{item.category}</span>
                              <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                                <div className="h-full bg-red-500 rounded" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs font-medium text-red-600 w-14 text-right">{formatCurrency(Math.abs(item.diff))}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()
                ) : (
                  <p className="text-sm text-muted-foreground italic">No categories spending more than average</p>
                )}
              </div>
            )}
            {/* Spending more vs average — show second if overall spending is less, first if spending more */}
            {monthlySpendInsights.vsTtmAvg > 0 ? (
              <div>
                <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <h3 className="font-semibold text-sm">Spending more vs average</h3>
                </div>
                {monthlySpendInsights.spendingMore.length > 0 ? (
                  (() => {
                    const maxVal = Math.max(
                      ...monthlySpendInsights.spendingMore.map((i) => Math.abs(i.diff)),
                      ...monthlySpendInsights.spendingLess.map((i) => Math.abs(i.diff)),
                      1
                    )
                    return (
                      <div className="space-y-3">
                        {monthlySpendInsights.spendingMore.map((item) => {
                          const pct = (Math.abs(item.diff) / maxVal) * 100
                          return (
                            <div key={item.category} className="flex items-center gap-2">
                              <span className="text-sm w-24 truncate">{item.category}</span>
                              <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                                <div className="h-full bg-red-500 rounded" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs font-medium text-red-600 w-14 text-right">{formatCurrency(Math.abs(item.diff))}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()
                ) : (
                  <p className="text-sm text-muted-foreground italic">No categories spending more than average</p>
                )}
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <h3 className="font-semibold text-sm">Spending less vs average</h3>
                </div>
                {monthlySpendInsights.spendingLess.length > 0 ? (
                  (() => {
                    const maxVal = Math.max(
                      ...monthlySpendInsights.spendingMore.map((i) => Math.abs(i.diff)),
                      ...monthlySpendInsights.spendingLess.map((i) => Math.abs(i.diff)),
                      1
                    )
                    return (
                      <div className="space-y-3">
                        {monthlySpendInsights.spendingLess.map((item) => {
                          const pct = (Math.abs(item.diff) / maxVal) * 100
                          return (
                            <div key={item.category} className="flex items-center gap-2">
                              <span className="text-sm w-24 truncate">{item.category}</span>
                              <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                                <div className="h-full bg-green-500 rounded" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs font-medium text-green-600 w-14 text-right">{formatCurrency(Math.abs(item.diff))}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()
                ) : (
                  <p className="text-sm text-muted-foreground italic">No categories spending less than average</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
