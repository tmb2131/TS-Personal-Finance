'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCurrency } from '@/lib/contexts/currency-context'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { BudgetTarget, MonthlyTrend, AnnualTrend } from '@/lib/types'
import { computeAnnualTrends, computeMonthlyTrends, computeAnnualForecasts, getDefaultForecastMethods } from '@/lib/forecasting'
import { isExpenseCategory } from '@/lib/category-filters'
import { computeForecastNeutralDailyBudget } from '@/lib/forecast-neutral-daily-budget'
import { TrendingUp, TrendingDown, DollarSign, Target, Calendar, ChevronRight, X, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/utils/cn'

const EXCLUDED_CATEGORIES = ['Income', 'Gift Money', 'Other Income', 'Excluded']
const SESSION_KEY = 'findash_daily_summary_shown'

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

function toLocalDateString(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

interface DailySummaryModalProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  modalKey?: number
}

export function DailySummaryModal({ open: controlledOpen, onOpenChange: controlledOnOpenChange, modalKey }: DailySummaryModalProps = {}) {
  const router = useRouter()
  const { currency, fxRate, convertAmount } = useCurrency()
  // Support both controlled (from context) and uncontrolled (direct prop) usage
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const onOpenChange = isControlled ? controlledOnOpenChange! : setInternalOpen
  const [loading, setLoading] = useState(true)
  
  // Data state
  const [budgetData, setBudgetData] = useState<BudgetTarget[]>([])
  const [annualTrends, setAnnualTrends] = useState<AnnualTrend[]>([])
  const [monthlyTrends, setMonthlyTrends] = useState<MonthlyTrend[]>([])
  const [forecastBridge, setForecastBridge] = useState<ForecastBridgeResponse | null>(null)
  const [lastSyncDate, setLastSyncDate] = useState<string | null>(null)
  const [forecastByCategory, setForecastByCategory] = useState<Map<string, { forecast: number; ytd: number; annualBudget: number }> | null>(null)
  const [forecastSettings, setForecastSettings] = useState<ForecastSettingsRow[]>([])
  const [todayTransactions, setTodayTransactions] = useState<TransactionForDayRow[]>([])
  const [mobileMonthlyDriversView, setMobileMonthlyDriversView] = useState<'less' | 'more'>('less')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]
    const utcTodayStr = now.toISOString().split('T')[0]
    const localTodayStr = toLocalDateString(now)
    const todayDateCandidates = Array.from(new Set([localTodayStr, utcTodayStr]))

    try {
      const [budgetResult, syncResult, bridgeResponse, settingsResult, todayTxResult, { data: { user } }] = await Promise.all([
        supabase.from('budget_targets').select('*'),
        supabase.from('sync_metadata').select('last_sync_at').single(),
        fetch(`/api/forecast-bridge?startDate=${yesterdayStr}&endDate=${utcTodayStr}`)
          .then(async (r) => {
            if (!r.ok) {
              const errorData = await r.json().catch(() => ({}))
              if (r.status === 400 || r.status === 404) return null
              throw new Error(errorData.error || 'Failed to fetch forecast bridge')
            }
            return r.json()
          })
          .catch(() => null),
        supabase.from('forecast_settings').select('category, current_year_method, manual_year_forecast'),
        supabase.from('transaction_log').select('date, category, amount_gbp, amount_usd').in('date', todayDateCandidates),
        supabase.auth.getUser(),
      ])

      const annualResult = user ? await computeAnnualTrends(supabase, user.id) : []
      const monthlyResult = user ? await computeMonthlyTrends(supabase, user.id) : []
      const annualForecasts = user ? await computeAnnualForecasts(supabase, user.id) : null

      if (budgetResult.data) setBudgetData(budgetResult.data as BudgetTarget[])
      if (Array.isArray(annualResult)) setAnnualTrends(annualResult as AnnualTrend[])
      if (Array.isArray(monthlyResult)) setMonthlyTrends(monthlyResult as MonthlyTrend[])
      if (annualForecasts) setForecastByCategory(annualForecasts)
      if (syncResult.data?.last_sync_at) setLastSyncDate(syncResult.data.last_sync_at)
      if (Array.isArray(settingsResult.data)) setForecastSettings(settingsResult.data as ForecastSettingsRow[])
      if (Array.isArray(todayTxResult.data)) setTodayTransactions(todayTxResult.data as TransactionForDayRow[])
      if (bridgeResponse && !bridgeResponse.error) {
        setForecastBridge(bridgeResponse as ForecastBridgeResponse)
      }
    } catch (error) {
      console.error('Error fetching daily summary data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Reset state when modal closes; fetch when open
  useEffect(() => {
    if (!open) {
      setLoading(true)
      setBudgetData([])
      setAnnualTrends([])
      setMonthlyTrends([])
      setForecastBridge(null)
      setLastSyncDate(null)
      setForecastSettings([])
      setTodayTransactions([])
      return
    }
    fetchData()
  }, [open, fetchData])

  // Calculate annual estimated spend (sum of tracking_est for expense categories)
  const annualEstimatedSpend = useMemo(() => {
    const expenses = budgetData.filter((b) => !EXCLUDED_CATEGORIES.includes(b.category))
    const totalGBP = expenses.reduce((sum, b) => {
      const forecast = forecastByCategory?.get(b.category)?.forecast ?? b.annual_budget_gbp ?? 0
      return sum + Math.abs(forecast)
    }, 0)
    return currency === 'USD' ? convertAmount(totalGBP, 'GBP', fxRate) : totalGBP
  }, [budgetData, currency, fxRate, convertAmount, forecastByCategory])

  // Last year total spend (from annual_trends) for comparison
  const annualVsLastYear = useMemo(() => {
    const expenses = annualTrends.filter((a) => !EXCLUDED_CATEGORIES.includes(a.category))
    if (!expenses.length) return null
    const lastYearGBP = expenses.reduce((sum, a) => sum + Math.abs(a.cur_yr_minus_1 ?? 0), 0)
    if (lastYearGBP === 0) return null
    const lastYearDisplay = currency === 'USD' ? convertAmount(lastYearGBP, 'GBP', fxRate) : lastYearGBP
    const diff = annualEstimatedSpend - lastYearDisplay
    const percent = (diff / Math.abs(lastYearDisplay)) * 100
    return { lastYearDisplay, diff, percent }
  }, [annualTrends, annualEstimatedSpend, currency, fxRate, convertAmount])

  // Calculate gap to budget
  const gapToBudget = useMemo(() => {
    const expenses = budgetData.filter((b) => !EXCLUDED_CATEGORIES.includes(b.category))
    const budgetTotalGBP = expenses.reduce((sum, b) => sum + Math.abs(b.annual_budget_gbp ?? 0), 0)
    const forecastTotalGBP = expenses.reduce((sum, b) => {
      const forecast = forecastByCategory?.get(b.category)?.forecast ?? b.annual_budget_gbp ?? 0
      return sum + Math.abs(forecast)
    }, 0)
    const gapGBP = budgetTotalGBP - forecastTotalGBP // Positive = under budget, negative = over budget
    return currency === 'USD' ? convertAmount(gapGBP, 'GBP', fxRate) : gapGBP
  }, [budgetData, currency, fxRate, convertAmount, forecastByCategory])

  // Change since yesterday (from forecast bridge)
  const yesterdayChange = useMemo(() => {
    if (!forecastBridge) return null
    const changeGBP = forecastBridge.totalEnd - forecastBridge.totalStart
    return currency === 'USD' ? convertAmount(changeGBP, 'GBP', fxRate) : changeGBP
  }, [forecastBridge, currency, fxRate, convertAmount])

  // Top drivers of yesterday's change
  const topDrivers = useMemo(() => {
    if (!forecastBridge) return { underBudgetDrivers: [], overBudgetDrivers: [] }
    const allDrivers = forecastBridge.drivers
      .filter((d) => d.category !== 'Other' && Math.abs(d.delta) > 0)
      .map((d) => ({
        category: d.category,
        deltaGBP: d.delta,
        delta: currency === 'USD' ? convertAmount(d.delta, 'GBP', fxRate) : d.delta,
      }))
    
    // Split into under budget drivers (negative delta) and over budget drivers (positive delta)
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

  // Daily forecast-neutral budget: spend amount that leaves next-day forecast gap unchanged.
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
      todaySpendByCategory.set(row.category, (todaySpendByCategory.get(row.category) ?? 0) + amountGbp)
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
    }
  }, [forecastByCategory, forecastSettings, todayTransactions, currency, fxRate, convertAmount])

  // Current monthly spend
  const currentMonthlySpend = useMemo(() => {
    const expenses = monthlyTrends.filter((m) => !EXCLUDED_CATEGORIES.includes(m.category))
    const totalGBP = expenses.reduce((sum, m) => sum + Math.abs(m.cur_month_est ?? 0), 0)
    return currency === 'USD' ? convertAmount(totalGBP, 'GBP', fxRate) : totalGBP
  }, [monthlyTrends, currency, fxRate, convertAmount])

  // 3-month average monthly spend
  const threeMonthAvg = useMemo(() => {
    const expenses = monthlyTrends.filter((m) => !EXCLUDED_CATEGORIES.includes(m.category))
    const totalGBP = expenses.reduce((sum, m) => sum + Math.abs(m.ttm_avg ?? 0), 0)
    return currency === 'USD' ? convertAmount(totalGBP, 'GBP', fxRate) : totalGBP
  }, [monthlyTrends, currency, fxRate, convertAmount])

  // Monthly spend vs 3M average
  const monthlyVs3M = useMemo(() => {
    if (threeMonthAvg === 0) return null
    return currentMonthlySpend - threeMonthAvg
  }, [currentMonthlySpend, threeMonthAvg])

  const monthlyVs3MPercent = useMemo(() => {
    if (!monthlyVs3M || threeMonthAvg === 0) return null
    return (monthlyVs3M / Math.abs(threeMonthAvg)) * 100
  }, [monthlyVs3M, threeMonthAvg])

  // Monthly spend drivers (categories with biggest changes vs 3M avg)
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
      .filter((item) => Math.abs(item.diffGBP) > 50) // Filter small changes
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
    if (abs >= 1_000_000) {
      return `${symbol}${(value / 1_000_000).toFixed(1)}M`
    }
    if (abs >= 1_000) {
      return `${symbol}${(value / 1_000).toFixed(1)}k`
    }
    return `${symbol}${Math.round(value)}`
  }

  const formatPercent = (value: number) => {
    const abs = Math.abs(value)
    if (abs < 0.1) return '<0.1%'
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
  }

  useEffect(() => {
    if (!open) return
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
  }, [open, monthlyVs3M, monthlyDrivers.spendingLess.length, monthlyDrivers.spendingMore.length])

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // When closing, set sessionStorage
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(SESSION_KEY, 'true')
      }
    }
    // Always notify parent of the change
    onOpenChange(newOpen)
  }

  const handleNavigate = (path: string) => {
    // Close modal without setting sessionStorage (navigation is not a dismissal)
    onOpenChange(false)
    const hashMatch = path.match(/#([^#]+)$/)
    const hash = hashMatch ? hashMatch[1] : null
    const targetPathname = path.split('#')[0] || '/'
    const applyHashIfOnTarget = () => {
      if (typeof window === 'undefined' || !hash) return
      if (window.location.pathname === targetPathname) window.location.hash = hash
    }
    setTimeout(() => {
      router.push(path)
      if (hash) {
        applyHashIfOnTarget()
        setTimeout(applyHashIfOnTarget, 100)
        setTimeout(applyHashIfOnTarget, 300)
        setTimeout(applyHashIfOnTarget, 600)
        setTimeout(applyHashIfOnTarget, 1000)
      }
    }, 150)
  }

  /** Use Link for Dashboard (/#...) so the hash is in the href. If Next.js drops the hash, apply it after nav. */
  const navButtonClass = 'flex items-center justify-between w-full gap-1.5 mb-1.5 group hover:opacity-70 transition-opacity text-left'
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
    
    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
    }
    if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    }
    const diffMins = Math.floor(diffMs / (1000 * 60))
    return diffMins < 1 ? 'Just now' : `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
  }

  const hasChangeCard = yesterdayChange !== null
  const hasNeutralCard = dailyNeutralInsights !== null
  const hasMonthlyDrivers = monthlyDrivers.spendingMore.length > 0 || monthlyDrivers.spendingLess.length > 0
  const hasSpendingLessDrivers = monthlyDrivers.spendingLess.length > 0
  const hasSpendingMoreDrivers = monthlyDrivers.spendingMore.length > 0
  const mobileDriverMode =
    mobileMonthlyDriversView === 'less'
      ? (hasSpendingLessDrivers ? 'less' : 'more')
      : (hasSpendingMoreDrivers ? 'more' : 'less')
  const mobileDriverRows = mobileDriverMode === 'less' ? monthlyDrivers.spendingLess : monthlyDrivers.spendingMore
  const cardContentClass = 'px-4 pb-4 pt-4 sm:px-5 sm:pb-4 sm:pt-5 md:pt-5'

  const todayFormatted = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <Dialog key={modalKey} open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="left-0 top-0 h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-none border-0 p-0 sm:left-[50%] sm:top-[50%] sm:max-h-[90vh] sm:w-[calc(100%-2rem)] sm:max-w-5xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:gap-5 sm:rounded-xl sm:border sm:p-6"
      >
        <div className="flex justify-center pt-3 sm:hidden" aria-hidden>
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        <DialogClose
          className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.5rem)] z-30 flex h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-background/95 text-muted-foreground shadow-sm backdrop-blur-sm transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:right-4 sm:top-4 sm:h-auto sm:w-auto sm:gap-1 sm:rounded-md sm:border sm:border-border/60 sm:bg-background/80 sm:px-2 sm:py-1.5 sm:backdrop-blur-none"
        >
          <X className="h-5 w-5 sm:h-4 sm:w-4" />
          <span className="sr-only">Close</span>
          <kbd className="hidden text-[10px] font-normal text-muted-foreground/70 sm:inline">ESC</kbd>
        </DialogClose>

        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="sticky top-0 z-10 border-b border-border/60 bg-background/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] text-left backdrop-blur-sm sm:static sm:border-0 sm:bg-transparent sm:px-0 sm:pb-3 sm:pt-0 sm:backdrop-blur-none">
            <DialogTitle className="pr-12 text-2xl font-bold sm:text-xl">Daily Financial Summary</DialogTitle>
            <DialogDescription className="text-sm sm:text-xs">
              <span>{todayFormatted}</span>
              {lastSyncDate && <span className="text-muted-foreground/70"> · Updated {formatLastSync()}</span>}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 sm:px-0 sm:pb-0 sm:pt-0">
            {loading ? (
              <div className="space-y-4 py-3 sm:py-4">
                <Skeleton className="h-4 w-28 rounded" />
                <Skeleton className="h-36 w-full rounded-xl" />
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
                {/* Section: Budget Overview */}
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 sm:mb-1.5">Budget Overview</p>
                  <Card className={cn(
                    'overflow-hidden border-l-[3px]',
                    gapToBudget >= 0
                      ? 'border-l-green-500 bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent'
                      : 'border-l-red-500 bg-gradient-to-br from-red-500/10 via-red-500/5 to-transparent'
                  )}>
                    <CardContent className={cardContentClass}>
                      <button
                        onClick={() => handleNavigate('/insights#annual-budget')}
                        className="flex items-center justify-between w-full gap-1.5 mb-3 group hover:opacity-70 transition-opacity text-left"
                      >
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            'flex h-7 w-7 items-center justify-center rounded-full',
                            gapToBudget >= 0 ? 'bg-green-500/15' : 'bg-red-500/15'
                          )}>
                            {gapToBudget >= 0
                              ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                              : <AlertCircle className="h-4 w-4 text-red-600" />
                            }
                          </div>
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gap to Budget</span>
                        </div>
                        <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                      <div className={cn(
                        'text-4xl sm:text-2xl font-bold tabular-nums leading-none',
                        gapToBudget >= 0 ? 'text-green-600' : 'text-red-600'
                      )}>
                        {gapToBudget >= 0 ? 'Under' : 'Over'} {formatCurrency(Math.abs(gapToBudget))}
                      </div>
                      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-border/40 pt-3">
                        <Link
                          href="/#budget-table"
                          onClick={() => { onOpenChange(false); applyHashAfterNav('/#budget-table') }}
                          className="hover:opacity-70 transition-opacity"
                        >
                          <span className="text-xs text-muted-foreground">Annual Est. Spend: </span>
                          <span className="text-sm font-semibold tabular-nums">{formatCurrency(annualEstimatedSpend)}</span>
                        </Link>
                        {annualVsLastYear && (
                          <div className={cn(
                            'text-xs font-medium tabular-nums',
                            annualVsLastYear.diff < 0 ? 'text-green-600' : annualVsLastYear.diff > 0 ? 'text-red-600' : 'text-muted-foreground'
                          )}>
                            vs last year: {annualVsLastYear.diff >= 0 ? '+' : '-'}{formatCurrency(Math.abs(annualVsLastYear.diff))}
                            {Math.abs(annualVsLastYear.percent) >= 0.1 && (
                              <span className="text-muted-foreground">
                                {' '}({annualVsLastYear.percent >= 0 ? '+' : ''}{annualVsLastYear.percent.toFixed(1)}%)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Section: Today */}
                {(hasChangeCard || hasNeutralCard) && (
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 sm:mb-1.5">Today</p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
                      {hasNeutralCard && (
                        <Card className={cn(
                          'order-1 sm:order-2 overflow-hidden border-l-[3px]',
                          !hasChangeCard && 'sm:col-span-2',
                          dailyNeutralInsights?.direction === 'improving'
                            ? 'border-l-green-500'
                            : dailyNeutralInsights?.direction === 'worsening'
                              ? 'border-l-red-500'
                              : 'border-l-blue-500'
                        )}>
                          <CardContent className={cardContentClass}>
                            <button
                              onClick={() => handleNavigate('/analysis#forecast-evolution')}
                              className="flex items-center justify-between w-full gap-1.5 mb-2 group hover:opacity-70 transition-opacity text-left"
                            >
                              <div className="flex items-center gap-2">
                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/15">
                                  <Target className="h-4 w-4 text-blue-600" />
                                </div>
                                <span className="text-xs font-medium text-muted-foreground">Forecast-Neutral Today</span>
                              </div>
                              <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                            {dailyNeutralInsights?.neutralSpend != null ? (
                              <>
                                {(() => {
                                  const percentRaw = dailyNeutralInsights.usedPercent ?? 0
                                  const percentClamped = Math.min(Math.max(percentRaw, 0), 100)
                                  const mobileSize = 96
                                  const desktopSize = 86
                                  const stroke = 10
                                  const usageColor =
                                    percentRaw < 85 ? 'text-green-500' : percentRaw <= 100 ? 'text-amber-500' : 'text-red-500'
                                  const ringStroke =
                                    percentRaw < 85 ? '#22c55e' : percentRaw <= 100 ? '#f59e0b' : '#ef4444'

                                  const renderRing = (size: number) => {
                                    const radius = (size - stroke) / 2
                                    const circumference = 2 * Math.PI * radius
                                    const dash = (percentClamped / 100) * circumference
                                    return (
                                      <div className="relative" style={{ width: size, height: size }}>
                                        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
                                          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-muted/35" />
                                          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={ringStroke} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${dash} ${circumference - dash}`} />
                                        </svg>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                          <div className={cn('text-xs font-semibold tabular-nums', usageColor)}>
                                            {Math.round(percentRaw)}%
                                          </div>
                                        </div>
                                      </div>
                                    )
                                  }

                                  return (
                                    <>
                                      <div className="flex flex-col items-center gap-3 sm:hidden">
                                        {renderRing(mobileSize)}
                                        <div className="text-center">
                                          <div className="text-3xl font-bold tabular-nums leading-none">
                                            {formatCurrency(dailyNeutralInsights.neutralSpend)}
                                          </div>
                                          <div className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                                            Used {formatCurrency(dailyNeutralInsights.usedSpend)}
                                          </div>
                                          <div className={cn('text-xs font-semibold mt-1', usageColor)}>
                                            {percentRaw.toFixed(Math.abs(percentRaw) >= 100 ? 0 : 1)}% of neutral
                                          </div>
                                        </div>
                                      </div>

                                      <div className="hidden sm:flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="text-xl font-bold tabular-nums">
                                            {formatCurrency(dailyNeutralInsights.neutralSpend)}
                                          </div>
                                          <div className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                                            Used {formatCurrency(dailyNeutralInsights.usedSpend)}
                                          </div>
                                          <div className={cn('text-[10px] font-semibold mt-0.5', usageColor)}>
                                            {percentRaw.toFixed(Math.abs(percentRaw) >= 100 ? 0 : 1)}% of neutral
                                          </div>
                                        </div>
                                        <div className="shrink-0">
                                          {renderRing(desktopSize)}
                                        </div>
                                      </div>
                                    </>
                                  )
                                })()}
                                <div className={cn(
                                  'text-xs sm:text-[10px] font-medium mt-2 sm:mt-1',
                                  dailyNeutralInsights.direction === 'improving'
                                    ? 'text-green-600'
                                    : dailyNeutralInsights.direction === 'worsening'
                                      ? 'text-red-600'
                                      : 'text-muted-foreground'
                                )}>
                                  {dailyNeutralInsights.direction === 'improving'
                                    ? 'Projected next-day forecast: improving'
                                    : dailyNeutralInsights.direction === 'worsening'
                                      ? 'Projected next-day forecast: worsening'
                                      : 'Projected next-day forecast: flat'}
                                </div>
                              </>
                            ) : (
                              <div className="text-xs text-muted-foreground">Not enough data</div>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      {hasChangeCard && (
                        <Card className={cn(
                          'order-2 sm:order-1 overflow-hidden border-l-[3px]',
                          !hasNeutralCard && 'sm:col-span-2',
                          yesterdayChange !== null && yesterdayChange < 0 ? 'border-l-green-500' : 'border-l-red-500'
                        )}>
                          <CardContent className={cardContentClass}>
                            <button
                              onClick={() => handleNavigate('/analysis#forecast-evolution')}
                              className="flex items-center justify-between w-full gap-1.5 mb-2 group hover:opacity-70 transition-opacity text-left"
                            >
                              <div className="flex items-center gap-2">
                                <div className={cn(
                                  'flex h-7 w-7 items-center justify-center rounded-full',
                                  yesterdayChange !== null && yesterdayChange < 0 ? 'bg-green-500/15' : 'bg-red-500/15'
                                )}>
                                  <Calendar className={cn(
                                    'h-4 w-4',
                                    yesterdayChange !== null && yesterdayChange < 0 ? 'text-green-600' : 'text-red-600'
                                  )} />
                                </div>
                                <span className="text-xs font-medium text-muted-foreground">Change Since Yesterday</span>
                              </div>
                              <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                            {yesterdayChange !== null && (
                              <div className={cn(
                                'text-2xl sm:text-lg font-bold tabular-nums leading-none',
                                yesterdayChange < 0 ? 'text-green-600' : 'text-red-600'
                              )}>
                                {yesterdayChange < 0 ? (
                                  <span className="flex items-center gap-1.5">
                                    <TrendingDown className="h-4 w-4 shrink-0" />
                                    Gap improved by {formatCurrency(Math.abs(yesterdayChange))}
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1.5">
                                    <TrendingUp className="h-4 w-4 shrink-0" />
                                    Gap worsened by {formatCurrency(Math.abs(yesterdayChange))}
                                  </span>
                                )}
                              </div>
                            )}
                            {yesterdayDriverHighlights.length > 0 && (
                              <div className="mt-3">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-xs sm:text-[10px] font-bold text-muted-foreground">Top Drivers</span>
                                  <button
                                    type="button"
                                    onClick={() => handleNavigate('/analysis#forecast-evolution')}
                                    className="text-xs font-medium text-primary hover:opacity-80 transition-opacity sm:hidden"
                                  >
                                    View all
                                  </button>
                                </div>
                                {(() => {
                                  const maxDelta = Math.max(...yesterdayDriverHighlights.map((d) => Math.abs(d.delta)), 1)
                                  return (
                                    <div className="space-y-1.5">
                                      {yesterdayDriverHighlights.map((driver, index) => {
                                        const pct = (Math.abs(driver.delta) / maxDelta) * 100
                                        const isWorsening = driver.delta > 0
                                        return (
                                          <div
                                            key={driver.category}
                                            className={cn('flex items-center gap-2', index > 1 && 'hidden sm:flex')}
                                          >
                                            <span className="text-xs sm:text-[10px] w-24 sm:w-16 truncate text-muted-foreground font-medium">
                                              {driver.category}
                                            </span>
                                            <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden min-w-0">
                                              <div
                                                className={cn('h-full rounded-full transition-all duration-500', isWorsening ? 'bg-red-500' : 'bg-green-500')}
                                                style={{ width: `${pct}%` }}
                                              />
                                            </div>
                                            <span className={cn(
                                              'text-xs sm:text-[10px] font-medium tabular-nums w-14 sm:w-11 text-right shrink-0',
                                              isWorsening ? 'text-red-600' : 'text-green-600'
                                            )}>
                                              {formatCurrency(Math.abs(driver.delta))}
                                            </span>
                                          </div>
                                        )
                                      })}
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
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 sm:mb-1.5">This Month</p>
                  <div className="space-y-4 sm:space-y-3">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
                      <Card className="border-l-[3px] border-l-blue-500">
                        <CardContent className={cardContentClass}>
                          <Link
                            href="/#monthly-trends"
                            onClick={() => { onOpenChange(false); applyHashAfterNav('/#monthly-trends') }}
                            className={navButtonClass}
                          >
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/15">
                                <Calendar className="h-4 w-4 text-blue-600" />
                              </div>
                              <span className="text-xs font-medium text-muted-foreground">Est. This Month</span>
                            </div>
                            <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Link>
                          <div className="text-2xl sm:text-xl font-bold tabular-nums leading-none">
                            {formatCurrency(currentMonthlySpend)}
                          </div>
                        </CardContent>
                      </Card>

                      <Card className={cn(
                        'border-l-[3px]',
                        monthlyVs3M !== null
                          ? monthlyVs3M >= 0 ? 'border-l-red-500' : 'border-l-green-500'
                          : 'border-l-muted-foreground/30'
                      )}>
                        <CardContent className={cardContentClass}>
                          <Link
                            href="/#monthly-trends"
                            onClick={() => { onOpenChange(false); applyHashAfterNav('/#monthly-trends') }}
                            className={navButtonClass}
                          >
                            <div className="flex items-center gap-2">
                              <div className={cn(
                                'flex h-7 w-7 items-center justify-center rounded-full',
                                monthlyVs3M !== null
                                  ? monthlyVs3M >= 0 ? 'bg-red-500/15' : 'bg-green-500/15'
                                  : 'bg-muted'
                              )}>
                                <TrendingUp className={cn(
                                  'h-4 w-4',
                                  monthlyVs3M !== null
                                    ? monthlyVs3M >= 0 ? 'text-red-600' : 'text-green-600'
                                    : 'text-muted-foreground'
                                )} />
                              </div>
                              <span className="text-xs font-medium text-muted-foreground">vs 3M Avg</span>
                            </div>
                            <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Link>
                          {monthlyVs3M !== null ? (
                            <div className={cn(
                              'text-2xl sm:text-xl font-bold tabular-nums leading-none',
                              monthlyVs3M >= 0 ? 'text-red-600' : 'text-green-600'
                            )}>
                              {monthlyVs3M >= 0 ? '+' : ''}{formatCurrency(monthlyVs3M)}
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
                            href="/#monthly-trends"
                            onClick={() => { onOpenChange(false); applyHashAfterNav('/#monthly-trends') }}
                            className="flex items-center justify-between w-full mb-2 group hover:opacity-70 transition-opacity"
                          >
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/15">
                                <TrendingUp className="h-4 w-4 text-amber-600" />
                              </div>
                              <span className="text-xs font-medium text-muted-foreground">Monthly Spend Drivers</span>
                            </div>
                            <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Link>

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

                            <div className={cn(
                              'text-xs font-bold mb-1.5',
                              mobileDriverMode === 'less' ? 'text-green-600' : 'text-red-600'
                            )}>
                              {mobileDriverMode === 'less' ? 'Spending Less:' : 'Spending More:'}
                            </div>
                            <div className="space-y-2">
                              {mobileDriverRows.slice(0, 3).map((driver, index) => {
                                const pct = (Math.abs(driver.diff) / monthlyDriversMaxDiff) * 100
                                return (
                                  <div key={driver.category} className="flex items-center gap-2">
                                    <span className="text-xs w-24 truncate text-muted-foreground font-medium">{driver.category}</span>
                                    <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden min-w-0">
                                      <div
                                        className={cn('h-full rounded-full transition-all duration-500', mobileDriverMode === 'less' ? 'bg-green-500' : 'bg-red-500')}
                                        style={{ width: `${pct}%`, transitionDelay: `${index * 75}ms` }}
                                      />
                                    </div>
                                    <span className={cn(
                                      'text-xs font-medium tabular-nums w-14 text-right shrink-0',
                                      mobileDriverMode === 'less' ? 'text-green-600' : 'text-red-600'
                                    )}>
                                      {formatCurrency(Math.abs(driver.diff))}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>

                          <div className="hidden sm:grid sm:grid-cols-2 sm:gap-3">
                            {hasSpendingLessDrivers && (
                              <div className={cn(!hasSpendingMoreDrivers && 'sm:col-span-2')}>
                                <div className="text-[10px] font-bold mb-1 text-green-600">Spending Less:</div>
                                <div className="space-y-1.5">
                                  {monthlyDrivers.spendingLess.map((driver, index) => {
                                    const pct = (Math.abs(driver.diff) / monthlyDriversMaxDiff) * 100
                                    return (
                                      <div key={driver.category} className="flex items-center gap-1.5">
                                        <span className="text-[10px] w-16 truncate text-muted-foreground font-medium">{driver.category}</span>
                                        <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden min-w-0">
                                          <div className="h-full rounded-full bg-green-500 transition-all duration-500" style={{ width: `${pct}%`, transitionDelay: `${index * 75}ms` }} />
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
                                <div className="text-[10px] font-bold mb-1 text-red-600">Spending More:</div>
                                <div className="space-y-1.5">
                                  {monthlyDrivers.spendingMore.map((driver, index) => {
                                    const pct = (Math.abs(driver.diff) / monthlyDriversMaxDiff) * 100
                                    return (
                                      <div key={driver.category} className="flex items-center gap-1.5">
                                        <span className="text-[10px] w-16 truncate text-muted-foreground font-medium">{driver.category}</span>
                                        <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden min-w-0">
                                          <div className="h-full rounded-full bg-red-500 transition-all duration-500" style={{ width: `${pct}%`, transitionDelay: `${index * 75}ms` }} />
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
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Show once per session (e.g. after first login). Next login = new session = show again.
export function shouldShowDailySummary(): boolean {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(SESSION_KEY) !== 'true'
}
