'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useSync } from '@/lib/contexts/sync-context'
import { useDailySummary } from '@/lib/hooks/queries/use-daily-summary'
import { useChartTheme } from '@/lib/hooks/use-chart-theme'
import { getChartTooltipContentStyle, getChartTooltipWrapperStyle } from '@/lib/chart-styles'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/ui/page-header'
import { BudgetTarget, MonthlyTrend, AnnualTrend } from '@/lib/types'
import { getDefaultForecastMethods } from '@/lib/forecasting'
import { isExpenseCategory } from '@/lib/category-filters'
import { computeForecastNeutralDailyBudget } from '@/lib/forecast-neutral-daily-budget'
import { computeTodayHeadroom, type YearMethod as HeadroomYearMethod } from '@/lib/today-headroom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  Target,
  Calendar,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  MinusCircle,
  Info,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { toLocalDateString } from '@/lib/daily-summary-utils'
import { getBudgetStatusConfig } from '@/lib/budget-status'
import { FinancialHealthBanner } from '@/components/financial-health-banner'
import { useFinancialHealth } from '@/lib/hooks/use-financial-health'
import { MilestonesBanner } from '@/components/milestones-banner'
import { ForecastWeekTrendCard } from '@/components/summary/forecast-week-trend-card'

const SPEND_FILL = '#64748b'
const SPEND_FILL_ALT = '#475569'
const HEADROOM_FILL = '#86efac'
const HEADROOM_FILL_ALT = '#bbf7d0'
const HEADROOM_LABEL_FILL = '#16a34a'

const GAP_CHANGE_THRESHOLD = 0.5

const EXCLUDED_CATEGORIES = ['Income', 'Gift Money', 'Other Income', 'Excluded']

type YearMethod = 'Annual' | 'Linear' | 'Budget' | 'Manual'

type ForecastSettingsRow = {
  category: string
  current_year_method: YearMethod | null
  manual_year_forecast: number | null
}

type TransactionForDayRow = {
  date: string
  category: string
  amount_gbp: number | null
  amount_usd: number | null
}

function getDayOfYear(value: Date): number {
  const start = new Date(value.getFullYear(), 0, 0)
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.floor((Number(value) - Number(start)) / msPerDay)
}

function getDaysInYear(year: number): number {
  return new Date(year, 1, 29).getMonth() === 1 ? 366 : 365
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function inferSpendDirection(
  annualBudget: number,
  ytdYesterday: number,
  todaySpend: number,
  fallbackDirection: 1 | -1
): 1 | -1 {
  const candidates = [annualBudget, ytdYesterday, todaySpend]
  for (const value of candidates) {
    if (Math.abs(value) > 1e-9) return value >= 0 ? 1 : -1
  }
  return fallbackDirection
}

interface ForecastBridgeResponse {
  startDate: string
  endDate: string
  expensesBudgetStart: number
  expensesForecastStart: number
  expensesBudgetEnd: number
  expensesForecastEnd: number
  totalStart: number
  totalEnd: number
  drivers: Array<{
    category: string
    startForecast: number
    endForecast: number
    delta: number
  }>
}


export function SummaryPageContent() {
  const router = useRouter()
  const { currency, fxRate, convertAmount } = useCurrency()
  const { handleSync, syncing } = useSync()
  const chartTheme = useChartTheme()
  const [mobileMonthlyDriversView, setMobileMonthlyDriversView] = useState<'less' | 'more'>('less')
  const { data: healthData } = useFinancialHealth()

  const { data: rawData, isLoading: loading } = useDailySummary()

  const budgetData = useMemo(() => (rawData?.budgetData as BudgetTarget[]) ?? [], [rawData])
  const annualTrends = useMemo(() => (rawData?.annualTrends as AnnualTrend[]) ?? [], [rawData])
  const monthlyTrends = useMemo(() => (rawData?.monthlyTrends as MonthlyTrend[]) ?? [], [rawData])
  const todayMetrics = rawData?.todayMetrics as
    | {
        impliedForecastChangeIfNoMoreSpend: number | null
        gapChangeSinceYesterday: number | null
      }
    | undefined

  const forecastBridge = useMemo((): ForecastBridgeResponse | null => {
    const fb = rawData?.forecastBridge
    if (fb && !(fb as { error?: unknown }).error) return fb as ForecastBridgeResponse
    return null
  }, [rawData])
  const lastSyncDate = useMemo(() => (rawData?.lastSyncDate as string) ?? null, [rawData])
  const forecastSettings = useMemo(() => (rawData?.forecastSettings as ForecastSettingsRow[]) ?? [], [rawData])
  const todayTransactions = useMemo(() => (rawData?.todayTransactions as TransactionForDayRow[]) ?? [], [rawData])
  const forecastByCategory = useMemo((): Map<string, { forecast: number; ytd: number; annualBudget: number }> | null => {
    if (!Array.isArray(rawData?.forecastByCategory)) return null
    const map = new Map<string, { forecast: number; ytd: number; annualBudget: number }>()
    for (const e of rawData.forecastByCategory as { category: string; forecast: number; ytd: number; annualBudget: number }[]) {
      map.set(e.category, { forecast: e.forecast, ytd: e.ytd, annualBudget: e.annualBudget })
    }
    return map
  }, [rawData])

  const annualEstimatedSpend = useMemo(() => {
    const expenses = budgetData.filter((b) => !EXCLUDED_CATEGORIES.includes(b.category))
    const totalGBP = expenses.reduce((sum, b) => {
      const forecast = forecastByCategory?.get(b.category)?.forecast ?? b.annual_budget_gbp ?? 0
      return sum + Math.abs(forecast)
    }, 0)
    return currency === 'USD' ? convertAmount(totalGBP, 'GBP', fxRate) : totalGBP
  }, [budgetData, currency, fxRate, convertAmount, forecastByCategory])

  const annualVsLastYear = useMemo(() => {
    const expenses = annualTrends.filter((a) => !EXCLUDED_CATEGORIES.includes(a.category))
    if (!expenses.length) return null
    const lastYearGBP = expenses.reduce((sum, a) => sum + Math.abs(a.cur_yr_minus_1 ?? 0), 0)
    if (lastYearGBP === 0) return null
    const lastYearDisplay =
      currency === 'USD' ? convertAmount(lastYearGBP, 'GBP', fxRate) : lastYearGBP
    const diff = annualEstimatedSpend - lastYearDisplay
    const percent = (diff / Math.abs(lastYearDisplay)) * 100
    return { lastYearDisplay, diff, percent }
  }, [annualTrends, annualEstimatedSpend, currency, fxRate, convertAmount])

  const { gapToBudget, budgetTotal } = useMemo(() => {
    const expenses = budgetData.filter((b) => !EXCLUDED_CATEGORIES.includes(b.category))
    const budgetTotalGBP = expenses.reduce((sum, b) => sum + Math.abs(b.annual_budget_gbp ?? 0), 0)
    const forecastTotalGBP = expenses.reduce((sum, b) => {
      const forecast = forecastByCategory?.get(b.category)?.forecast ?? b.annual_budget_gbp ?? 0
      return sum + Math.abs(forecast)
    }, 0)
    const gapGBP = budgetTotalGBP - forecastTotalGBP
    const toDisplay = (v: number) => currency === 'USD' ? convertAmount(v, 'GBP', fxRate) : v
    return { gapToBudget: toDisplay(gapGBP), budgetTotal: toDisplay(budgetTotalGBP) }
  }, [budgetData, currency, fxRate, convertAmount, forecastByCategory])

  const budgetStatusInfo = useMemo(
    () => getBudgetStatusConfig(gapToBudget, budgetTotal),
    [gapToBudget, budgetTotal]
  )

  const yesterdayChange = useMemo(() => {
    const changeGBP =
      todayMetrics?.gapChangeSinceYesterday ??
      (forecastBridge ? forecastBridge.totalEnd - forecastBridge.totalStart : null)
    if (changeGBP == null || !Number.isFinite(changeGBP)) return null
    return currency === 'USD' ? convertAmount(changeGBP, 'GBP', fxRate) : changeGBP
  }, [todayMetrics, forecastBridge, currency, fxRate, convertAmount])

  const yesterdayChangeLabel = useMemo(() => {
    if (yesterdayChange == null) return null
    if (Math.abs(yesterdayChange) <= GAP_CHANGE_THRESHOLD) return 'Unchanged from yesterday'
    return yesterdayChange < 0 ? 'Gap improved yesterday' : 'Gap worsened yesterday'
  }, [yesterdayChange])

  const yesterdayChangeImproved =
    yesterdayChange != null &&
    yesterdayChange < -GAP_CHANGE_THRESHOLD
  const yesterdayChangeWorsened =
    yesterdayChange != null &&
    yesterdayChange > GAP_CHANGE_THRESHOLD

  const topDrivers = useMemo(() => {
    if (!forecastBridge) return { underBudgetDrivers: [], overBudgetDrivers: [] }
    const allDrivers = forecastBridge.drivers
      .filter((d) => d.category !== 'Other' && Math.abs(d.delta) > 0)
      .map((d) => ({
        category: d.category,
        deltaGBP: d.delta,
        delta: currency === 'USD' ? convertAmount(d.delta, 'GBP', fxRate) : d.delta,
      }))

    const underBudgetDrivers = allDrivers
      .filter((d) => d.delta < 0)
      .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))
      .reverse()
      .slice(0, 3)

    const overBudgetDrivers = allDrivers
      .filter((d) => d.delta > 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3)

    return { underBudgetDrivers, overBudgetDrivers }
  }, [forecastBridge, currency, fxRate, convertAmount])

  const yesterdayDriverHighlights = useMemo(() => {
    return [...topDrivers.underBudgetDrivers, ...topDrivers.overBudgetDrivers]
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3)
  }, [topDrivers])

  const otherDriverDelta = useMemo(() => {
    if (!forecastBridge) return null
    const other = forecastBridge.drivers.find((d) => d.category === 'Other')
    if (!other || Math.abs(other.delta) < 0.5) return null
    const deltaGBP = other.delta
    return currency === 'USD' ? convertAmount(deltaGBP, 'GBP', fxRate) : deltaGBP
  }, [forecastBridge, currency, fxRate, convertAmount])

  const dailyNeutralInsights = useMemo(() => {
    if (!forecastByCategory) return null

    const now = new Date()
    const localTodayStr = toLocalDateString(now)
    const utcTodayStr = now.toISOString().split('T')[0]

    const txRowsByDate = new Map<string, TransactionForDayRow[]>()
    todayTransactions.forEach((row) => {
      const dateKey = String(row.date || '')
      if (!dateKey) return
      const list = txRowsByDate.get(dateKey) ?? []
      list.push(row)
      txRowsByDate.set(dateKey, list)
    })

    const effectiveTodayRows =
      (txRowsByDate.get(localTodayStr)?.length ?? 0) > 0
        ? txRowsByDate.get(localTodayStr) || []
        : txRowsByDate.get(utcTodayStr) || []

    const effectiveRate = fxRate > 0 ? fxRate : 1.27
    const todaySpendByCategory = new Map<string, number>()
    effectiveTodayRows.forEach((row) => {
      if (!row.category || !isExpenseCategory(row.category)) return
      const amountGbp =
        row.amount_gbp != null
          ? toNumber(row.amount_gbp)
          : row.amount_usd != null
            ? toNumber(row.amount_usd) / effectiveRate
            : 0
      if (!Number.isFinite(amountGbp) || amountGbp === 0) return
      todaySpendByCategory.set(
        row.category,
        (todaySpendByCategory.get(row.category) ?? 0) + amountGbp
      )
    })

    const settingsByCategory = new Map<string, ForecastSettingsRow>()
    forecastSettings.forEach((row) => {
      if (!row.category) return
      settingsByCategory.set(row.category, row)
    })

    const dayOfYear = getDayOfYear(now)
    const daysInYear = getDaysInYear(now.getFullYear())

    const categoryBaseRows = Array.from(forecastByCategory.entries())
      .filter(([category]) => isExpenseCategory(category))
      .map(([category, values]) => {
        const todaySpend = todaySpendByCategory.get(category) ?? 0
        const ytdYesterday = values.ytd - todaySpend
        const settingsRow = settingsByCategory.get(category)
        const method = settingsRow?.current_year_method ?? getDefaultForecastMethods(category).year
        return {
          category,
          annualBudget: values.annualBudget,
          ytdYesterday,
          method,
          manualYearForecast: settingsRow?.manual_year_forecast ?? null,
          todaySpend,
        }
      })

    if (categoryBaseRows.length === 0) return null

    const headroomCategories = categoryBaseRows.map((row) => ({
      category: row.category,
      annualBudget: row.annualBudget,
      ytdYesterday: row.ytdYesterday,
      method: row.method as HeadroomYearMethod,
      manualYearForecast: row.manualYearForecast,
    }))
    const { headroomByMethodology: headroomMap } = computeTodayHeadroom({
      dayOfYear,
      daysInYear,
      todaySpendByCategory,
      categories: headroomCategories,
    })
    const impliedForecastChangeGbp = todayMetrics?.impliedForecastChangeIfNoMoreSpend ?? null

    const spendByMethodology: Record<string, number> = { Annual: 0, Linear: 0, Budget: 0, Manual: 0 }
    categoryBaseRows.forEach((row) => {
      const spendPositive = Math.max(0, -(row.todaySpend ?? 0))
      const m = row.method ?? 'Linear'
      spendByMethodology[m] = (spendByMethodology[m] ?? 0) + spendPositive
    })
    const headroomByMethodology: Record<string, number | null> = {
      Annual: headroomMap.get('Annual') ?? null,
      Linear: headroomMap.get('Linear') ?? null,
    }

    const directionScore = categoryBaseRows.reduce((sum, row) => {
      const anchor = Math.abs(row.annualBudget) > 1e-9 ? row.annualBudget : row.ytdYesterday
      if (Math.abs(anchor) <= 1e-9) return sum
      return sum + Math.sign(anchor) * Math.abs(anchor)
    }, 0)
    const globalDirection: 1 | -1 = directionScore > 0 ? 1 : -1

    const categories = categoryBaseRows.map((row) => ({
      category: row.category,
      annualBudget: row.annualBudget,
      ytdYesterday: row.ytdYesterday,
      method: row.method,
      manualYearForecast: row.manualYearForecast,
      spendDirection: inferSpendDirection(
        row.annualBudget,
        row.ytdYesterday,
        row.todaySpend,
        globalDirection
      ),
    }))

    const spendWeightByCategory = new Map<string, number>()
    let hasPositiveWeights = false
    categories.forEach((row) => {
      const todaySpend = (todaySpendByCategory.get(row.category) ?? 0) * row.spendDirection
      if (todaySpend > 0) {
        spendWeightByCategory.set(row.category, todaySpend)
        hasPositiveWeights = true
      }
    })

    if (!hasPositiveWeights) {
      categories.forEach((row) => {
        const weight = Math.abs(row.annualBudget)
        if (weight > 0) {
          spendWeightByCategory.set(row.category, weight)
          hasPositiveWeights = true
        }
      })
    }

    if (!hasPositiveWeights) {
      categories.forEach((row) => {
        const weight = Math.abs(row.ytdYesterday)
        if (weight > 0) {
          spendWeightByCategory.set(row.category, weight)
          hasPositiveWeights = true
        }
      })
    }

    const neutralResult = computeForecastNeutralDailyBudget({
      dayOfYear,
      daysInYear,
      categories,
      todaySpendByCategory,
      spendWeightByCategory,
    })

    const toDisplayCurrency = (value: number) =>
      currency === 'USD' ? convertAmount(value, 'GBP', fxRate) : value

    const neutralSpend =
      neutralResult.neutralSpend != null
        ? Math.max(0, toDisplayCurrency(neutralResult.neutralSpend))
        : null
    const usedSpend = toDisplayCurrency(neutralResult.usedSpend)
    let direction: 'improving' | 'worsening' | 'flat' = 'flat'
    if (neutralResult.deltaAtUsed < -0.5) direction = 'improving'
    else if (neutralResult.deltaAtUsed > 0.5) direction = 'worsening'

    return {
      neutralSpend,
      usedSpend,
      usedPercent: neutralResult.usedPercent,
      direction,
      impliedForecastChange:
        impliedForecastChangeGbp != null && Number.isFinite(impliedForecastChangeGbp)
          ? toDisplayCurrency(impliedForecastChangeGbp)
          : null,
      spendByMethodology,
      headroomByMethodology,
    }
  }, [
    forecastByCategory,
    forecastSettings,
    todayTransactions,
    todayMetrics,
    currency,
    fxRate,
    convertAmount,
  ])

  const currentMonthlySpend = useMemo(() => {
    const expenses = monthlyTrends.filter((m) => !EXCLUDED_CATEGORIES.includes(m.category))
    const totalGBP = expenses.reduce((sum, m) => sum + Math.abs(m.cur_month_est ?? 0), 0)
    return currency === 'USD' ? convertAmount(totalGBP, 'GBP', fxRate) : totalGBP
  }, [monthlyTrends, currency, fxRate, convertAmount])

  const threeMonthAvg = useMemo(() => {
    const expenses = monthlyTrends.filter((m) => !EXCLUDED_CATEGORIES.includes(m.category))
    const totalGBP = expenses.reduce((sum, m) => sum + Math.abs(m.ttm_avg ?? 0), 0)
    return currency === 'USD' ? convertAmount(totalGBP, 'GBP', fxRate) : totalGBP
  }, [monthlyTrends, currency, fxRate, convertAmount])

  const monthlyVs3M = useMemo(() => {
    if (threeMonthAvg === 0) return null
    return currentMonthlySpend - threeMonthAvg
  }, [currentMonthlySpend, threeMonthAvg])

  const monthlyVs3MPercent = useMemo(() => {
    if (!monthlyVs3M || threeMonthAvg === 0) return null
    return (monthlyVs3M / Math.abs(threeMonthAvg)) * 100
  }, [monthlyVs3M, threeMonthAvg])

  const monthlyDrivers = useMemo(() => {
    const expenses = monthlyTrends.filter((m) => !EXCLUDED_CATEGORIES.includes(m.category))
    const categoryDiffs = expenses
      .map((m) => {
        const curEstGBP = Math.abs(m.cur_month_est ?? 0)
        const avgGBP = Math.abs(m.ttm_avg ?? 0)
        const diffGBP = curEstGBP - avgGBP
        return {
          category: m.category,
          diffGBP,
          diff: currency === 'USD' ? convertAmount(diffGBP, 'GBP', fxRate) : diffGBP,
        }
      })
      .filter((item) => Math.abs(item.diffGBP) > 50)
      .sort((a, b) => Math.abs(b.diffGBP) - Math.abs(a.diffGBP))

    const spendingMore = categoryDiffs.filter((item) => item.diffGBP > 0).slice(0, 3)
    const spendingLess = categoryDiffs.filter((item) => item.diffGBP < 0).slice(0, 3)

    return { spendingMore, spendingLess }
  }, [monthlyTrends, currency, fxRate, convertAmount])

  const monthlyDriversMaxDiff = useMemo(() => {
    return Math.max(
      ...monthlyDrivers.spendingMore.map((d) => Math.abs(d.diff)),
      ...monthlyDrivers.spendingLess.map((d) => Math.abs(d.diff)),
      1
    )
  }, [monthlyDrivers])

  const formatCurrency = (value: number) => {
    const abs = Math.abs(value)
    const symbol = currency === 'USD' ? '$' : '£'
    if (abs >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000) return `${symbol}${(value / 1_000).toFixed(1)}k`
    return `${symbol}${Math.round(value)}`
  }

  const formatPercent = (value: number) => {
    const abs = Math.abs(value)
    if (abs < 0.1) return '<0.1%'
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
  }

  useEffect(() => {
    if (monthlyVs3M !== null && monthlyVs3M > 0 && monthlyDrivers.spendingMore.length > 0) {
      setMobileMonthlyDriversView('more')
      return
    }
    if (monthlyDrivers.spendingLess.length > 0) {
      setMobileMonthlyDriversView('less')
      return
    }
    if (monthlyDrivers.spendingMore.length > 0) {
      setMobileMonthlyDriversView('more')
    }
  }, [monthlyVs3M, monthlyDrivers.spendingLess.length, monthlyDrivers.spendingMore.length])

  const handleNavigate = (path: string) => {
    const hashMatch = path.match(/#([^#]+)$/)
    const hash = hashMatch ? hashMatch[1] : null
    const targetPathname = path.split('#')[0] || '/'
    const applyHashIfOnTarget = () => {
      if (typeof window === 'undefined' || !hash) return
      if (window.location.pathname === targetPathname) window.location.hash = hash
    }
    router.push(path)
    if (hash) {
      setTimeout(applyHashIfOnTarget, 100)
      setTimeout(applyHashIfOnTarget, 300)
      setTimeout(applyHashIfOnTarget, 600)
      setTimeout(applyHashIfOnTarget, 1000)
    }
  }

  const applyHashAfterNav = (path: string) => {
    const hashMatch = path.match(/#([^#]+)$/)
    const hash = hashMatch ? hashMatch[1] : null
    if (!hash || typeof window === 'undefined') return
    const targetPathname = path.split('#')[0] || '/'
    const apply = () => {
      if (window.location.pathname === targetPathname) window.location.hash = hash
    }
    setTimeout(apply, 200)
    setTimeout(apply, 500)
    setTimeout(apply, 900)
  }

  const formatLastSync = () => {
    if (!lastSyncDate) return null
    const date = new Date(lastSyncDate)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
    if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    const diffMins = Math.floor(diffMs / (1000 * 60))
    return diffMins < 1 ? 'Just now' : `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
  }

  const hasChangeCard = yesterdayChange !== null
  const hasNeutralCard = dailyNeutralInsights !== null
  const hasMonthlyDrivers =
    monthlyDrivers.spendingMore.length > 0 || monthlyDrivers.spendingLess.length > 0
  const hasSpendingLessDrivers = monthlyDrivers.spendingLess.length > 0
  const hasSpendingMoreDrivers = monthlyDrivers.spendingMore.length > 0
  const mobileDriverMode =
    mobileMonthlyDriversView === 'less'
      ? hasSpendingLessDrivers
        ? 'less'
        : 'more'
      : hasSpendingMoreDrivers
        ? 'more'
        : 'less'
  const mobileDriverRows =
    mobileDriverMode === 'less' ? monthlyDrivers.spendingLess : monthlyDrivers.spendingMore
  const cardContentClass = 'px-4 pb-4 pt-4 sm:px-5 sm:pb-4 sm:pt-5 md:pt-5'
  const navButtonClass =
    'flex items-center justify-between w-full gap-1.5 mb-1.5 group hover:opacity-70 transition-opacity text-left'

  const todayFormatted = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <>
      <PageHeader
        title="Daily Summary"
        description={
          lastSyncDate
            ? `${todayFormatted} · Updated ${formatLastSync()}`
            : todayFormatted
        }
        accent="indigo"
      />

      <div>
        {loading ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Loading your daily summary...
              </p>
              <Skeleton className="h-4 w-28 rounded" />
              <Skeleton className="h-36 w-full rounded-xl" />
              <Skeleton className="h-4 w-20 rounded" />
              <Skeleton className="h-44 w-full rounded-xl" />
              <Skeleton className="h-4 w-16 rounded" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
              </div>
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-48 w-full rounded-xl" />
            </div>
          ) : (
            <div className="space-y-4 sm:space-y-3">
              {/* Financial Health Banner */}
              {healthData && (
                <FinancialHealthBanner
                  data={{
                    ...healthData,
                    budgetGap: gapToBudget,
                    budgetTotal: budgetTotal,
                  }}
                />
              )}

              {/* Milestones */}
              <MilestonesBanner />

              {/* Section: Budget Overview */}
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 sm:mb-1.5 sm:text-[10px]">
                  Budget Overview
                </p>
                <Card
                  className={cn(
                    'overflow-hidden border-l-[3px]',
                    budgetStatusInfo.borderClass,
                    budgetStatusInfo.level === 'under'
                      ? 'bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent'
                      : budgetStatusInfo.level === 'on_track'
                        ? 'bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent'
                        : budgetStatusInfo.level === 'slightly_over'
                          ? 'bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent'
                          : 'bg-gradient-to-br from-red-500/10 via-red-500/5 to-transparent'
                  )}
                >
                  <CardContent className={cardContentClass}>
                    <button
                      onClick={() => handleNavigate('/insights#annual-budget')}
                      className="flex items-center justify-between w-full gap-1.5 mb-3 group hover:opacity-70 transition-opacity text-left"
                    >
                      <div className="flex items-center gap-2">
                        <div className={cn('flex h-7 w-7 items-center justify-center rounded-full', budgetStatusInfo.bgClass)}>
                          {budgetStatusInfo.level === 'under' || budgetStatusInfo.level === 'on_track' ? (
                            <CheckCircle2 className={cn('h-4 w-4', budgetStatusInfo.textClass)} />
                          ) : budgetStatusInfo.level === 'slightly_over' ? (
                            <MinusCircle className={cn('h-4 w-4', budgetStatusInfo.textClass)} />
                          ) : (
                            <Info className={cn('h-4 w-4', budgetStatusInfo.textClass)} />
                          )}
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Budget Status
                        </span>
                      </div>
                      <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                    <div>
                      <div className={cn('text-3xl sm:text-2xl font-bold leading-none', budgetStatusInfo.textClass)}>
                        {budgetStatusInfo.label}
                      </div>
                      {gapToBudget !== 0 && budgetTotal > 0 && (() => {
                        const pct = ((Math.abs(gapToBudget) / budgetTotal) * 100).toFixed(1)
                        const amt = formatCurrency(Math.abs(gapToBudget))
                        return (
                          <div className={cn('text-sm mt-1.5 tabular-nums', budgetStatusInfo.textClass, 'opacity-80')}>
                            {budgetStatusInfo.level === 'under' && <>{amt} to spare</>}
                            {budgetStatusInfo.level === 'on_track' && <>just {amt} ({pct}%) above budget</>}
                            {budgetStatusInfo.level === 'slightly_over' && <>{amt} ({pct}%) above budget</>}
                            {budgetStatusInfo.level === 'over' && <>{amt} ({pct}%) over budget</>}
                          </div>
                        )
                      })()}
                    </div>
                    <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-border/40 pt-3">
                      <Link
                        href="/dashboard#budget-table"
                        onClick={() => applyHashAfterNav('/dashboard#budget-table')}
                        className="hover:opacity-70 transition-opacity"
                      >
                        <span className="text-xs text-muted-foreground">Annual Est. Spend: </span>
                        <span className="text-sm font-semibold tabular-nums">
                          {formatCurrency(annualEstimatedSpend)}
                        </span>
                      </Link>
                      {annualVsLastYear && (
                        <div
                          className={cn(
                            'text-xs font-medium tabular-nums',
                            annualVsLastYear.diff < 0
                              ? 'text-green-600'
                              : annualVsLastYear.diff > 0
                                ? 'text-red-600'
                                : 'text-muted-foreground'
                          )}
                        >
                          vs last year:{' '}
                          {annualVsLastYear.diff >= 0 ? '+' : '-'}
                          {formatCurrency(Math.abs(annualVsLastYear.diff))}
                          {Math.abs(annualVsLastYear.percent) >= 0.1 && (
                            <span className="text-muted-foreground">
                              {' '}
                              ({annualVsLastYear.percent >= 0 ? '+' : ''}
                              {annualVsLastYear.percent.toFixed(1)}%)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Section: This Week */}
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 sm:mb-1.5 sm:text-[10px]">
                  This Week
                </p>
                <ForecastWeekTrendCard
                  cardContentClass={cardContentClass}
                  onNavigate={handleNavigate}
                />
              </div>

              {/* Section: Today */}
              {(hasChangeCard || hasNeutralCard) && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 sm:mb-1.5 sm:text-[10px]">
                    Today
                  </p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
                    {hasNeutralCard && (
                      <Card
                        className={cn(
                          'order-1 sm:order-2 overflow-hidden border-l-[3px]',
                          !hasChangeCard && 'sm:col-span-2',
                          dailyNeutralInsights?.direction === 'improving'
                            ? 'border-l-green-500'
                            : dailyNeutralInsights?.direction === 'worsening'
                              ? 'border-l-red-500'
                              : 'border-l-blue-500'
                        )}
                      >
                        <CardContent className={cardContentClass}>
                          <button
                            onClick={() => handleNavigate('/today')}
                            className="flex items-center justify-between w-full gap-1.5 mb-2 group hover:opacity-70 transition-opacity text-left"
                          >
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/15">
                                <Target className="h-4 w-4 text-blue-600" />
                              </div>
                              <span className="text-xs font-medium text-muted-foreground">
                                Tomorrow If No More Spend
                              </span>
                            </div>
                            <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                          {dailyNeutralInsights?.impliedForecastChange != null &&
                          Number.isFinite(dailyNeutralInsights.impliedForecastChange) ? (
                            <div
                              className={cn(
                                'text-sm font-bold mb-3 flex items-center gap-1.5',
                                dailyNeutralInsights.impliedForecastChange > 0
                                  ? 'text-red-600 dark:text-red-400'
                                  : dailyNeutralInsights.impliedForecastChange < 0
                                    ? 'text-green-600 dark:text-green-400'
                                    : 'text-foreground'
                              )}
                            >
                              {dailyNeutralInsights.impliedForecastChange > 0 ? (
                                <>
                                  <TrendingUp className="h-4 w-4 shrink-0" />
                                  By tomorrow, overall forecast rises by{' '}
                                  {formatCurrency(
                                    Math.abs(dailyNeutralInsights.impliedForecastChange)
                                  )}
                                  {' '}vs the start of today if you spend nothing else today.
                                </>
                              ) : dailyNeutralInsights.impliedForecastChange < 0 ? (
                                <>
                                  <TrendingDown className="h-4 w-4 shrink-0" />
                                  By tomorrow, overall forecast falls by{' '}
                                  {formatCurrency(
                                    Math.abs(dailyNeutralInsights.impliedForecastChange)
                                  )}
                                  {' '}vs the start of today if you spend nothing else today.
                                </>
                              ) : (
                                'By tomorrow, overall forecast is unchanged vs the start of today if you spend nothing else today.'
                              )}
                            </div>
                          ) : null}
                          <p className="text-[11px] text-muted-foreground/70 mb-2">
                            Room to spend by methodology (not the forecast change above).
                          </p>
                          {dailyNeutralInsights?.spendByMethodology != null &&
                          dailyNeutralInsights?.headroomByMethodology != null ? (
                            (() => {
                              const toDisplay = (v: number) =>
                                currency === 'USD' ? convertAmount(v, 'GBP', fxRate) : v
                              const chartData = ['Annual', 'Linear'].map((name) => ({
                                name,
                                spend: toDisplay(
                                  dailyNeutralInsights!.spendByMethodology![name] ?? 0
                                ),
                                headroom: Math.max(
                                  0,
                                  toDisplay(
                                    dailyNeutralInsights!.headroomByMethodology![name] ?? 0
                                  )
                                ),
                              }))
                              const formatChartCurrency = (value: number) =>
                                new Intl.NumberFormat('en-GB', {
                                  style: 'currency',
                                  currency,
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 0,
                                }).format(value)
                              return (
                                <div className="mt-2 h-[120px] w-full">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                      data={chartData}
                                      layout="vertical"
                                      margin={{ top: 4, right: 52, left: 8, bottom: 4 }}
                                    >
                                      <XAxis
                                        type="number"
                                        width={0}
                                        axisLine={false}
                                        tick={false}
                                        tickLine={false}
                                      />
                                      <YAxis
                                        type="category"
                                        dataKey="name"
                                        width={44}
                                        tick={{ fontSize: 11 }}
                                      />
                                      <Tooltip
                                        wrapperStyle={getChartTooltipWrapperStyle(chartTheme)}
                                        formatter={(value: number, name: string) => [
                                          formatChartCurrency(value),
                                          name === 'spend' ? 'Spend' : 'Room to spend',
                                        ]}
                                        contentStyle={getChartTooltipContentStyle(chartTheme, { fontSize: 12 })}
                                      />
                                      <Legend
                                        wrapperStyle={{ fontSize: 10 }}
                                        formatter={(value) =>
                                          value === 'spend' ? 'Spend' : 'Room to spend'
                                        }
                                      />
                                      <Bar
                                        dataKey="spend"
                                        name="spend"
                                        stackId="today"
                                        fill={SPEND_FILL}
                                        radius={[0, 2, 2, 0]}
                                      >
                                        {chartData.map((_, i) => (
                                          <Cell
                                            key={`s-${i}`}
                                            fill={i % 2 === 0 ? SPEND_FILL : SPEND_FILL_ALT}
                                          />
                                        ))}
                                      </Bar>
                                      <Bar
                                        dataKey="headroom"
                                        name="headroom"
                                        stackId="today"
                                        fill={HEADROOM_FILL}
                                        radius={[0, 2, 2, 0]}
                                      >
                                        {chartData.map((_, i) => (
                                          <Cell
                                            key={`h-${i}`}
                                            fill={i % 2 === 0 ? HEADROOM_FILL : HEADROOM_FILL_ALT}
                                          />
                                        ))}
                                        <LabelList
                                          dataKey="headroom"
                                          position="right"
                                          offset={6}
                                          formatter={(value: number) =>
                                            value != null && value > 0
                                              ? formatChartCurrency(value)
                                              : ''
                                          }
                                          style={{
                                            fontSize: 10,
                                            fill: HEADROOM_LABEL_FILL,
                                            fontWeight: 'bold',
                                          }}
                                        />
                                      </Bar>
                                    </BarChart>
                                  </ResponsiveContainer>
                                </div>
                              )
                            })()
                          ) : (
                            <div className="text-xs text-muted-foreground">Not enough data</div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {hasChangeCard && (
                      <Card
                        className={cn(
                          'order-2 sm:order-1 overflow-hidden border-l-[3px]',
                          !hasNeutralCard && 'sm:col-span-2',
                          yesterdayChangeImproved
                            ? 'border-l-green-500'
                            : yesterdayChangeWorsened
                              ? 'border-l-red-500'
                              : 'border-l-slate-400 dark:border-l-slate-500'
                        )}
                      >
                        <CardContent className={cardContentClass}>
                          <button
                            onClick={() => handleNavigate('/analysis#forecast-evolution')}
                            className="flex items-center justify-between w-full gap-1.5 mb-2 group hover:opacity-70 transition-opacity text-left"
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  'flex h-7 w-7 items-center justify-center rounded-full',
                                  yesterdayChangeImproved
                                    ? 'bg-green-500/15'
                                    : yesterdayChangeWorsened
                                      ? 'bg-red-500/15'
                                      : 'bg-muted'
                                )}
                              >
                                <Calendar
                                  className={cn(
                                    'h-4 w-4',
                                    yesterdayChangeImproved
                                      ? 'text-green-600 dark:text-green-400'
                                      : yesterdayChangeWorsened
                                        ? 'text-red-600 dark:text-red-400'
                                        : 'text-muted-foreground'
                                  )}
                                />
                              </div>
                              <span className="text-xs font-medium text-muted-foreground">
                                Change Since Yesterday
                              </span>
                            </div>
                            <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                          {yesterdayChange !== null && yesterdayChangeLabel && (
                            <>
                              <div
                                className={cn(
                                  'text-3xl sm:text-2xl font-bold tabular-nums leading-none',
                                  yesterdayChangeImproved
                                    ? 'text-green-600 dark:text-green-400'
                                    : yesterdayChangeWorsened
                                      ? 'text-red-600 dark:text-red-400'
                                      : 'text-muted-foreground'
                                )}
                              >
                                {formatCurrency(Math.abs(yesterdayChange))}
                              </div>
                              <p
                                className={cn(
                                  'mt-1.5 text-sm opacity-80',
                                  yesterdayChangeImproved
                                    ? 'text-green-600 dark:text-green-400'
                                    : yesterdayChangeWorsened
                                      ? 'text-red-600 dark:text-red-400'
                                      : 'text-muted-foreground'
                                )}
                              >
                                {yesterdayChangeLabel}
                              </p>
                              <p className="mt-1 text-[11px] text-muted-foreground/70">
                                Based on yesterday&apos;s spending only; unaffected by today.
                              </p>
                            </>
                          )}
                          {yesterdayDriverHighlights.length > 0 && (
                            <div className="mt-3">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs sm:text-[10px] font-bold text-muted-foreground">
                                  Top Drivers
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleNavigate('/analysis#forecast-evolution')}
                                  className="text-xs font-medium text-primary hover:opacity-80 transition-opacity sm:hidden"
                                >
                                  View all
                                </button>
                              </div>
                              {(() => {
                                const maxDelta = Math.max(
                                  ...yesterdayDriverHighlights.map((d) => Math.abs(d.delta)),
                                  1
                                )
                                return (
                                  <div className="space-y-1.5">
                                    {yesterdayDriverHighlights.map((driver) => {
                                      const pct = (Math.abs(driver.delta) / maxDelta) * 100
                                      const isWorsening = driver.delta > 0
                                      return (
                                        <div
                                          key={driver.category}
                                          className="flex items-center gap-2"
                                        >
                                          <span className="text-xs sm:text-[10px] w-24 sm:w-16 truncate text-muted-foreground font-medium">
                                            {driver.category}
                                          </span>
                                          <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden min-w-0">
                                            <div
                                              className={cn(
                                                'h-full rounded-full transition-all duration-500',
                                                isWorsening ? 'bg-red-500' : 'bg-green-500'
                                              )}
                                              style={{ width: `${pct}%` }}
                                            />
                                          </div>
                                          <span
                                            className={cn(
                                              'text-xs sm:text-[10px] font-medium tabular-nums w-14 sm:w-11 text-right shrink-0',
                                              isWorsening ? 'text-red-600' : 'text-green-600'
                                            )}
                                          >
                                            {formatCurrency(Math.abs(driver.delta))}
                                          </span>
                                        </div>
                                      )
                                    })}
                                    {otherDriverDelta != null && (
                                      <p className="text-[10px] text-muted-foreground pt-0.5">
                                        Other categories:{' '}
                                        <span
                                          className={cn(
                                            'font-medium tabular-nums',
                                            otherDriverDelta < 0
                                              ? 'text-green-600'
                                              : otherDriverDelta > 0
                                                ? 'text-red-600'
                                                : ''
                                          )}
                                        >
                                          {otherDriverDelta < 0 ? '−' : '+'}
                                          {formatCurrency(Math.abs(otherDriverDelta))}
                                        </span>
                                      </p>
                                    )}
                                  </div>
                                )
                              })()}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              )}

              {/* Section: This Month */}
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 sm:mb-1.5 sm:text-[10px]">
                  This Month
                </p>
                <div className="space-y-4 sm:space-y-3">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
                    <Card className="border-l-[3px] border-l-blue-500">
                      <CardContent className={cardContentClass}>
                        <Link
                          href="/dashboard#monthly-trends"
                          onClick={() => applyHashAfterNav('/dashboard#monthly-trends')}
                          className={navButtonClass}
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/15">
                              <Calendar className="h-4 w-4 text-blue-600" />
                            </div>
                            <span className="text-xs font-medium text-muted-foreground">
                              Est. This Month
                            </span>
                          </div>
                          <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                        <div className="text-2xl sm:text-xl font-bold tabular-nums leading-none">
                          {formatCurrency(currentMonthlySpend)}
                        </div>
                      </CardContent>
                    </Card>

                    <Card
                      className={cn(
                        'border-l-[3px]',
                        monthlyVs3M !== null
                          ? monthlyVs3M >= 0
                            ? 'border-l-red-500'
                            : 'border-l-green-500'
                          : 'border-l-muted-foreground/30'
                      )}
                    >
                      <CardContent className={cardContentClass}>
                        <Link
                          href="/dashboard#monthly-trends"
                          onClick={() => applyHashAfterNav('/dashboard#monthly-trends')}
                          className={navButtonClass}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                'flex h-7 w-7 items-center justify-center rounded-full',
                                monthlyVs3M !== null
                                  ? monthlyVs3M >= 0
                                    ? 'bg-red-500/15'
                                    : 'bg-green-500/15'
                                  : 'bg-muted'
                              )}
                            >
                              <TrendingUp
                                className={cn(
                                  'h-4 w-4',
                                  monthlyVs3M !== null
                                    ? monthlyVs3M >= 0
                                      ? 'text-red-600'
                                      : 'text-green-600'
                                    : 'text-muted-foreground'
                                )}
                              />
                            </div>
                            <span className="text-xs font-medium text-muted-foreground">
                              vs 3M Avg
                            </span>
                          </div>
                          <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                        {monthlyVs3M !== null ? (
                          <div
                            className={cn(
                              'text-2xl sm:text-xl font-bold tabular-nums leading-none',
                              monthlyVs3M >= 0 ? 'text-red-600' : 'text-green-600'
                            )}
                          >
                            {monthlyVs3M >= 0 ? '+' : ''}
                            {formatCurrency(monthlyVs3M)}
                            {monthlyVs3MPercent !== null && (
                              <span className="text-xs font-normal ml-1">
                                ({formatPercent(monthlyVs3MPercent)})
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">No comparison</div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {hasMonthlyDrivers && (
                    <Card className="border-l-[3px] border-l-amber-500">
                      <CardContent className={cardContentClass}>
                        <Link
                          href="/dashboard#monthly-trends"
                          onClick={() => applyHashAfterNav('/dashboard#monthly-trends')}
                          className="flex items-center justify-between w-full mb-2 group hover:opacity-70 transition-opacity"
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/15">
                              <TrendingUp className="h-4 w-4 text-amber-600" />
                            </div>
                            <span className="text-xs font-medium text-muted-foreground">
                              Monthly Spend Drivers
                            </span>
                          </div>
                          <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>

                        {/* Mobile: toggle between spending less / more */}
                        <div className="sm:hidden">
                          {hasSpendingLessDrivers && hasSpendingMoreDrivers && (
                            <div className="mb-3 grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
                              <button
                                type="button"
                                onClick={() => setMobileMonthlyDriversView('less')}
                                className={cn(
                                  'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                                  mobileDriverMode === 'less'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                                )}
                              >
                                Less ({monthlyDrivers.spendingLess.length})
                              </button>
                              <button
                                type="button"
                                onClick={() => setMobileMonthlyDriversView('more')}
                                className={cn(
                                  'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                                  mobileDriverMode === 'more'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                                )}
                              >
                                More ({monthlyDrivers.spendingMore.length})
                              </button>
                            </div>
                          )}
                          <div
                            className={cn(
                              'text-xs font-bold mb-1.5',
                              mobileDriverMode === 'less' ? 'text-green-600' : 'text-red-600'
                            )}
                          >
                            {mobileDriverMode === 'less' ? 'Lower Than Average:' : 'Higher Than Average:'}
                          </div>
                          <div className="space-y-2">
                            {mobileDriverRows.slice(0, 3).map((driver, index) => {
                              const pct = (Math.abs(driver.diff) / monthlyDriversMaxDiff) * 100
                              return (
                                <div key={driver.category} className="flex items-center gap-2">
                                  <span className="text-xs w-24 truncate text-muted-foreground font-medium">
                                    {driver.category}
                                  </span>
                                  <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden min-w-0">
                                    <div
                                      className={cn(
                                        'h-full rounded-full transition-all duration-500',
                                        mobileDriverMode === 'less' ? 'bg-green-500' : 'bg-red-500'
                                      )}
                                      style={{
                                        width: `${pct}%`,
                                        transitionDelay: `${index * 75}ms`,
                                      }}
                                    />
                                  </div>
                                  <span
                                    className={cn(
                                      'text-xs font-medium tabular-nums w-14 text-right shrink-0',
                                      mobileDriverMode === 'less' ? 'text-green-600' : 'text-red-600'
                                    )}
                                  >
                                    {formatCurrency(Math.abs(driver.diff))}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        {/* Desktop: side-by-side columns */}
                        <div className="hidden sm:grid sm:grid-cols-2 sm:gap-3">
                          {hasSpendingLessDrivers && (
                            <div className={cn(!hasSpendingMoreDrivers && 'sm:col-span-2')}>
                              <div className="text-[10px] font-bold mb-1 text-green-600">
                                Lower Than Average:
                              </div>
                              <div className="space-y-1.5">
                                {monthlyDrivers.spendingLess.map((driver, index) => {
                                  const pct =
                                    (Math.abs(driver.diff) / monthlyDriversMaxDiff) * 100
                                  return (
                                    <div
                                      key={driver.category}
                                      className="flex items-center gap-1.5"
                                    >
                                      <span className="text-[10px] w-16 truncate text-muted-foreground font-medium">
                                        {driver.category}
                                      </span>
                                      <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden min-w-0">
                                        <div
                                          className="h-full rounded-full bg-green-500 transition-all duration-500"
                                          style={{
                                            width: `${pct}%`,
                                            transitionDelay: `${index * 75}ms`,
                                          }}
                                        />
                                      </div>
                                      <span className="text-[10px] font-medium tabular-nums w-11 text-right shrink-0 text-green-600">
                                        {formatCurrency(Math.abs(driver.diff))}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                          {hasSpendingMoreDrivers && (
                            <div className={cn(!hasSpendingLessDrivers && 'sm:col-span-2')}>
                              <div className="text-[10px] font-bold mb-1 text-red-600">
                                Higher Than Average:
                              </div>
                              <div className="space-y-1.5">
                                {monthlyDrivers.spendingMore.map((driver, index) => {
                                  const pct =
                                    (Math.abs(driver.diff) / monthlyDriversMaxDiff) * 100
                                  return (
                                    <div
                                      key={driver.category}
                                      className="flex items-center gap-1.5"
                                    >
                                      <span className="text-[10px] w-16 truncate text-muted-foreground font-medium">
                                        {driver.category}
                                      </span>
                                      <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden min-w-0">
                                        <div
                                          className="h-full rounded-full bg-red-500 transition-all duration-500"
                                          style={{
                                            width: `${pct}%`,
                                            transitionDelay: `${index * 75}ms`,
                                          }}
                                        />
                                      </div>
                                      <span className="text-[10px] font-medium tabular-nums w-11 text-right shrink-0 text-red-600">
                                        {formatCurrency(Math.abs(driver.diff))}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </div>
          )}
      </div>
    </>
  )
}
