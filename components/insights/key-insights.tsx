'use client'

import { useEffect, useState, useMemo } from 'react'
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
import { CheckCircle2, XCircle, TrendingUp, TrendingDown, DollarSign, Target, Calendar, AlertCircle, ChevronRight } from 'lucide-react'
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
} from 'recharts'

export function KeyInsights() {
  const { currency, convertAmount, fxRate } = useCurrency()
  const isMobile = useIsMobile()
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

  // Filter out income categories
  const expenseCategories = useMemo(() => {
    return ['Income', 'Gift Money']
  }, [])

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
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
      .map((d) => ({
        ...d,
        label: d.month.slice(0, 7).replace('-', '/'),
      }))

    // Personal vs Family for donut (current snapshot)
    const personalVsFamilyPie = [
      { name: 'Personal', value: Math.max(0, currentPersonal), fill: '#3b82f6' },
      { name: 'Family', value: Math.max(0, currentFamily), fill: '#8b5cf6' },
    ].filter((d) => d.value > 0)

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

  // Annual Spend Insights
  const annualSpendInsights = useMemo(() => {
    const expenses = annualTrends.filter((a) => !expenseCategories.includes(a.category))
    const mult = currency === 'USD' ? fxRate : 1

    // Values are negative for expenses (e.g., -100 means spending 100)
    const currentYearEst = expenses.reduce((sum, a) => sum + a.cur_yr_est, 0)
    const lastYear = expenses.reduce((sum, a) => sum + a.cur_yr_minus_1, 0)
    const fourYearAvg = expenses.reduce((sum, a) => {
      const avg = (a.cur_yr_minus_4 + a.cur_yr_minus_3 + a.cur_yr_minus_2 + a.cur_yr_minus_1) / 4
      return sum + avg
    }, 0)

    // For negative values: if cur_yr_est = -100 and avg = -120, we're spending 20 less
    // So: avg - cur_yr_est = -120 - (-100) = -20 (negative means spending MORE)
    // We want: cur_yr_est - avg = -100 - (-120) = 20 (positive means spending LESS)
    // Actually wait, if cur is -100 and avg is -120, cur is less negative = spending less
    // So: avg - cur = -120 - (-100) = -20 means spending MORE (wrong)
    // Let's think: spending less means cur > avg (less negative)
    // So: cur - avg = -100 - (-120) = 20 (positive = spending less) ✓
    const vsFourYearAvgGbp = currentYearEst - fourYearAvg // Positive = spending less
    const vsLastYearGbp = currentYearEst - lastYear
    const vsFourYearAvg = vsFourYearAvgGbp * mult
    const vsLastYear = vsLastYearGbp * mult

    // Calculate percentage change vs 4-year average (unchanged by currency)
    const vsFourYearAvgPercent = fourYearAvg !== 0 
      ? (vsFourYearAvgGbp / Math.abs(fourYearAvg)) * 100 
      : 0

    // Calculate per-category differences (convert to display currency)
    const categoryDiffs = expenses
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
      vsFourYearAvg,
      vsFourYearAvgPercent,
      vsLastYear,
      spendingLess,
      spendingMore,
    }
  }, [annualTrends, expenseCategories, currency, fxRate])

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

    return {
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
            ? 'flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin -mx-1 px-1'
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
                  <p className="text-xs text-muted-foreground mb-1">Current Value <span className="text-[11px]">(Trust excluded)</span></p>
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
                    <span className="text-xs text-muted-foreground">vs last year</span>
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
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
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
                    <span className="font-semibold">{formatCurrency(Math.abs(annualBudgetInsights.overallGap))}</span>
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
                    <span className="font-semibold">{formatCurrency(Math.abs(annualSpendInsights.vsFourYearAvg))}</span>
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
                    <span className="font-semibold">{formatCurrency(Math.abs(monthlySpendInsights.vsTtmAvg))}</span>
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
            Current net worth is {formatCurrencyLarge(netWorthInsights.currentTotal)} (Trust excluded).
          </p>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {/* Vs last year — prominent */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
            <span className="text-sm font-semibold text-muted-foreground">Vs last year</span>
            {netWorthInsights.vsLastYear > 0 ? (
              <>
                <TrendingUp className="h-8 w-8 text-green-600" />
                <span className="text-2xl font-bold tabular-nums text-green-600">
                  +{formatCurrencyLarge(Math.abs(netWorthInsights.vsLastYear))}
                </span>
                <span className="text-sm font-semibold text-green-600">{formatPercent(netWorthInsights.vsLastYearPercent)}</span>
              </>
            ) : (
              <>
                <TrendingDown className="h-8 w-8 text-red-600" />
                <span className="text-2xl font-bold tabular-nums text-red-600">
                  {formatCurrencyLarge(netWorthInsights.vsLastYear)}
                </span>
                <span className="text-sm font-semibold text-red-600">{formatPercent(netWorthInsights.vsLastYearPercent)}</span>
              </>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Net worth over time — small line chart */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Net worth over time</h3>
              {netWorthInsights.netWorthChartData.length > 0 ? (
                <div className="h-[180px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={netWorthInsights.netWorthChartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: getChartFontSizes(isMobile).axisTick, fontWeight: 600 }}
                        tickCount={isMobile ? 5 : undefined}
                        interval={isMobile ? 'preserveStartEnd' : undefined}
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
                      <Tooltip formatter={(v: number) => [formatCurrencyLarge(v), 'Total']} labelFormatter={(l) => l} />
                      <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No historical data yet.</p>
              )}
            </div>

            {/* Personal vs Family — donut */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Personal vs Family</h3>
              {netWorthInsights.personalVsFamilyPie.length > 0 ? (
                <div className="h-[180px] w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={netWorthInsights.personalVsFamilyPie}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                      >
                        {netWorthInsights.personalVsFamilyPie.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrencyLarge(v)} />
                      <Legend />
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
                  <div className="space-y-3">
                    {list.map((a) => {
                      const pct = (Math.abs(a.balance) / maxValue) * 100
                      return (
                        <div key={`${a.institution}-${a.accountName}`} className="flex items-start gap-2">
                          <span className="text-sm w-[200px] shrink-0 break-words leading-5">{a.accountName}</span>
                          <div className="flex-1 min-w-0 h-5 rounded bg-muted overflow-hidden shrink">
                            <div className="h-full bg-blue-500 rounded" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-medium w-16 text-right shrink-0 leading-5">{formatCurrencyLarge(a.balance)}</span>
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
          <p className="text-sm text-muted-foreground mt-1">
            {annualBudgetInsights.overallGap < 0 ? 'Under' : 'Over'} budget by {formatCurrency(Math.abs(annualBudgetInsights.overallGap))} vs {new Date().getFullYear()} budget.
          </p>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {/* Spend vs Budget — progress bar */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Spend vs budget</span>
              <span>
                {formatCurrency(annualBudgetInsights.totalTracking)} / {formatCurrency(annualBudgetInsights.totalBudget)}
              </span>
            </div>
            <Progress
              value={Math.min(100, (annualBudgetInsights.totalBudget > 0 ? (annualBudgetInsights.totalTracking / annualBudgetInsights.totalBudget) * 100 : 0))}
              className={annualBudgetInsights.overallGap > 0 ? '[&>div]:bg-red-500' : '[&>div]:bg-green-600'}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {formatPercentAbs(annualBudgetInsights.gapPercent)} {annualBudgetInsights.overallGap < 0 ? 'under' : 'over'} budget
            </p>
          </div>

          {/* Under / Over budget — horizontal bars (shared scale across both cards) */}
          <div className="grid md:grid-cols-2 gap-6">
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
          </div>
        </CardContent>
      </Card>

      {/* Annual Spend Section */}
      <Card id="annual-spend" className="scroll-mt-24">
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Annual Spend</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            This year vs 4-year average.
          </p>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {/* Vs 4-year average — prominent call-out */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
            <span className="text-sm font-semibold text-muted-foreground">Vs 4-year average</span>
            {annualSpendInsights.vsFourYearAvg > 0 ? (
              <>
                <TrendingDown className="h-8 w-8 text-green-600" />
                <span className="text-2xl font-bold tabular-nums text-green-600">
                  {formatCurrency(Math.abs(annualSpendInsights.vsFourYearAvg))} less
                </span>
                <span className="text-sm font-semibold text-green-600">{formatPercentAbs(annualSpendInsights.vsFourYearAvgPercent)}</span>
              </>
            ) : (
              <>
                <TrendingUp className="h-8 w-8 text-red-600" />
                <span className="text-2xl font-bold text-red-600">
                  {formatCurrency(Math.abs(annualSpendInsights.vsFourYearAvg))} more
                </span>
                <span className="text-sm font-semibold text-red-600">{formatPercentAbs(annualSpendInsights.vsFourYearAvgPercent)}</span>
              </>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Spending less — same style as Annual Budget (shared scale) */}
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
            {/* Spending more — same style as Annual Budget (shared scale) */}
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
          </div>
        </CardContent>
      </Card>

      {/* Monthly Spend Section */}
      <Card id="monthly-spend" className="scroll-mt-24">
        <CardHeader className="bg-muted/50">
          <CardTitle className="text-xl">Monthly Spend</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            This month vs trailing 12‑month average.
          </p>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {/* Vs TTM — prominent */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
            <span className="text-sm font-semibold text-muted-foreground">Vs TTM average</span>
            {monthlySpendInsights.vsTtmAvg > 0 ? (
              <>
                <TrendingDown className="h-8 w-8 text-green-600" />
                <span className="text-2xl font-bold tabular-nums text-green-600">
                  {formatCurrency(Math.abs(monthlySpendInsights.vsTtmAvg))} less
                </span>
                <span className="text-sm font-semibold text-green-600">{formatPercentAbs(monthlySpendInsights.vsTtmAvgPercent)}</span>
              </>
            ) : (
              <>
                <TrendingUp className="h-8 w-8 text-red-600" />
                <span className="text-2xl font-bold tabular-nums text-red-600">
                  {formatCurrency(Math.abs(monthlySpendInsights.vsTtmAvg))} more
                </span>
                <span className="text-sm font-semibold text-red-600">{formatPercentAbs(monthlySpendInsights.vsTtmAvgPercent)}</span>
              </>
            )}
          </div>

          {/* Categories driving delta — same style as Annual Budget (shared scale) */}
          <div className="grid md:grid-cols-2 gap-6">
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
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
