'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrency } from '@/lib/contexts/currency-context'
import { LineChart, Receipt, Calendar, CalendarDays, ChevronRight } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { HistoricalNetWorth } from '@/lib/types'
import { computeAnnualForecasts, getDefaultForecastMethods } from '@/lib/forecasting'
import { isExcludedCategory, isExpenseCategory } from '@/lib/category-filters'
import { computeForecastNeutralDailyBudget } from '@/lib/forecast-neutral-daily-budget'
import { cn } from '@/utils/cn'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'

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

function scrollToSection(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const main = document.querySelector('main')
  if (main) {
    const headerOffset = 100
    const elRect = el.getBoundingClientRect()
    const mainRect = main.getBoundingClientRect()
    const relativeTop = elRect.top - mainRect.top + main.scrollTop
    main.scrollTo({ top: relativeTop - headerOffset, behavior: 'smooth' })
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

type Section = {
  id: string
  label: string
  labelShort: string
  icon: React.ComponentType<{ className?: string }>
}

const SECTIONS_BASE: Section[] = [
  { id: 'budget-table', label: 'Budget (Net Income)', labelShort: 'Budget', icon: Receipt },
  { id: 'annual-trends', label: 'Annual Trends', labelShort: 'Annual', icon: Calendar },
  { id: 'monthly-trends', label: 'Monthly Trends', labelShort: 'Monthly', icon: CalendarDays },
]

export function DashboardAtAGlance() {
  const { currency, fxRate, convertAmount } = useCurrency()
  const isMobile = useIsMobile()
  const [showTrendShortcuts, setShowTrendShortcuts] = useState(false)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{
    netWorth: number | null
    budgetStatus: 'under' | 'over' | null
    budgetGap: number | null
    incomeTotal: number | null
    expensesTotal: number | null
    hasTrustData: boolean
    dailyNeutralBudget: number | null
    dailyUsedBudget: number | null
    dailyUsedPercent: number | null
    dailyForecastDirection: 'improving' | 'worsening' | 'flat' | null
  }>({
    netWorth: null,
    budgetStatus: null,
    budgetGap: null,
    incomeTotal: null,
    expensesTotal: null,
    hasTrustData: false,
    dailyNeutralBudget: null,
    dailyUsedBudget: null,
    dailyUsedPercent: null,
    dailyForecastDirection: null,
  })

  useEffect(() => {
    let cancelled = false
    async function fetchSummary() {
      const supabase = createClient()
      const today = new Date()
      const localTodayStr = toLocalDateString(today)
      const utcTodayStr = today.toISOString().split('T')[0]
      const todayDateCandidates = Array.from(new Set([localTodayStr, utcTodayStr]))
      const [nwRes, budgetRes, settingsRes, todayTxRes, { data: { user } }] = await Promise.all([
        supabase.from('historical_net_worth').select('*').order('date', { ascending: false }).limit(500),
        supabase.from('budget_targets').select('category, annual_budget_gbp'),
        supabase.from('forecast_settings').select('category, current_year_method, manual_year_forecast'),
        supabase.from('transaction_log').select('date, category, amount_gbp, amount_usd').in('date', todayDateCandidates),
        supabase.auth.getUser(),
      ])
      if (cancelled) return
      let netWorth: number | null = null
      let hasTrustData = false
      if (nwRes.data?.length) {
        const byYear = (nwRes.data as HistoricalNetWorth[]).reduce<Record<number, number>>((acc, item) => {
          const year = new Date(item.date).getFullYear()
          const amt = currency === 'USD' ? (item.amount_usd ?? 0) : (item.amount_gbp ?? 0)
          acc[year] = (acc[year] ?? 0) + amt
          return acc
        }, {})
        const latestYear = Math.max(...Object.keys(byYear).map(Number))
        netWorth = byYear[latestYear] ?? null
        
        // Check if there's any Trust data
        hasTrustData = (nwRes.data as HistoricalNetWorth[]).some(
          (item) => item.category === 'Trust' && Math.abs(currency === 'USD' ? (item.amount_usd ?? 0) : (item.amount_gbp ?? 0)) > 0
        )
      }
      let incomeTotal = 0
      let expensesTotal = 0
      let incomeBudget = 0
      let expensesBudget = 0
      const forecasts = user ? await computeAnnualForecasts(supabase, user.id) : null
      if (cancelled) return
      if (budgetRes.data?.length) {
        budgetRes.data.forEach((row: { category: string; annual_budget_gbp: number }) => {
          if (isExcludedCategory(row.category)) return
          const forecast = forecasts?.get(row.category)?.forecast ?? row.annual_budget_gbp
          const tracking = currency === 'USD' ? convertAmount(forecast, 'GBP', fxRate) : forecast
          const budget = currency === 'USD' ? convertAmount(row.annual_budget_gbp, 'GBP', fxRate) : row.annual_budget_gbp
          if (row.category === 'Income' || row.category === 'Gift Money') {
            incomeTotal += Math.abs(tracking)
            incomeBudget += Math.abs(budget)
          } else {
            expensesTotal += Math.abs(tracking)
            expensesBudget += Math.abs(budget)
          }
        })
      }
      const netIncomeTracking = incomeTotal - expensesTotal
      const netIncomeBudget = incomeBudget - expensesBudget
      const budgetGap = netIncomeTracking - netIncomeBudget
      const budgetStatus = budgetGap >= 0 ? 'under' : 'over'

      let dailyNeutralBudget: number | null = null
      let dailyUsedBudget: number | null = null
      let dailyUsedPercent: number | null = null
      let dailyForecastDirection: 'improving' | 'worsening' | 'flat' | null = null

      if (forecasts && user) {
        const settingsByCategory = new Map<string, ForecastSettingsRow>()
        ;((settingsRes.data || []) as ForecastSettingsRow[]).forEach((row) => {
          if (!row.category) return
          settingsByCategory.set(row.category, row)
        })

        const txRows = (todayTxRes.data || []) as TransactionForDayRow[]
        const txRowsByDate = new Map<string, TransactionForDayRow[]>()
        txRows.forEach((row) => {
          const dateKey = String(row.date || '')
          if (!dateKey) return
          const list = txRowsByDate.get(dateKey) ?? []
          list.push(row)
          txRowsByDate.set(dateKey, list)
        })

        // Prefer local calendar day; if empty (common when rows were keyed in UTC), fall back to UTC date.
        const effectiveTodayRows =
          (txRowsByDate.get(localTodayStr)?.length ?? 0) > 0
            ? txRowsByDate.get(localTodayStr) || []
            : txRowsByDate.get(utcTodayStr) || []

        const todaySpendByCategory = new Map<string, number>()
        const effectiveRate = fxRate > 0 ? fxRate : 1.27
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

        const dayOfYear = getDayOfYear(today)
        const daysInYear = getDaysInYear(today.getFullYear())

        const categoryBaseRows = Array.from(forecasts.entries())
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

        const directionScore = categoryBaseRows.reduce((sum, row) => {
          const anchor = Math.abs(row.annualBudget) > 1e-9 ? row.annualBudget : row.ytdYesterday
          if (Math.abs(anchor) <= 1e-9) return sum
          return sum + Math.sign(anchor) * Math.abs(anchor)
        }, 0)
        const globalDirection: 1 | -1 = directionScore > 0 ? 1 : -1

        const neutralCategories = categoryBaseRows.map((row) => ({
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
        neutralCategories.forEach((row) => {
          const todaySpend = (todaySpendByCategory.get(row.category) ?? 0) * row.spendDirection
          if (todaySpend > 0) {
            spendWeightByCategory.set(row.category, todaySpend)
            hasPositiveWeights = true
          }
        })

        if (!hasPositiveWeights) {
          neutralCategories.forEach((row) => {
            const weight = Math.abs(row.annualBudget)
            if (weight > 0) {
              spendWeightByCategory.set(row.category, weight)
              hasPositiveWeights = true
            }
          })
        }

        if (!hasPositiveWeights) {
          neutralCategories.forEach((row) => {
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
          categories: neutralCategories,
          todaySpendByCategory,
          spendWeightByCategory,
        })

        const toDisplayCurrency = (value: number) =>
          currency === 'USD' ? convertAmount(value, 'GBP', fxRate) : value

        dailyNeutralBudget =
          neutralResult.neutralSpend != null
            ? Math.max(0, toDisplayCurrency(neutralResult.neutralSpend))
            : null
        dailyUsedBudget = toDisplayCurrency(neutralResult.usedSpend)
        dailyUsedPercent = neutralResult.usedPercent
        if (neutralResult.deltaAtUsed < -0.5) dailyForecastDirection = 'improving'
        else if (neutralResult.deltaAtUsed > 0.5) dailyForecastDirection = 'worsening'
        else dailyForecastDirection = 'flat'
      }

      setData({
        netWorth,
        budgetStatus,
        budgetGap,
        incomeTotal: incomeTotal || null,
        expensesTotal: expensesTotal || null,
        hasTrustData,
        dailyNeutralBudget,
        dailyUsedBudget,
        dailyUsedPercent,
        dailyForecastDirection,
      })
      setLoading(false)
    }
    fetchSummary()
    return () => { cancelled = true }
  }, [currency, fxRate, convertAmount])

  const formatCompact = (value: number) => {
    const abs = Math.abs(value)
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`
    return value.toFixed(0)
  }
  const formatPercent = (value: number) => {
    const abs = Math.abs(value)
    const decimals = abs >= 100 ? 0 : 1
    return `${value.toFixed(decimals)}%`
  }
  const symbol = currency === 'USD' ? '$' : '£'

  const getCardContent = (sectionId: string) => {
    if (sectionId === 'net-worth-chart') {
      if (loading) return <Skeleton className="h-6 w-20" />
      if (data.netWorth != null) return <span className="text-2xl font-bold tabular-nums">{symbol}{formatCompact(data.netWorth)}</span>
      return <span className="text-sm text-muted-foreground">—</span>
    }
    if (sectionId === 'budget-table') {
      if (loading) return <Skeleton className="h-6 w-24" />
      if (data.budgetStatus) {
        return (
          <span className={cn('text-2xl font-bold tabular-nums', data.budgetStatus === 'under' ? 'text-green-600' : 'text-red-600')}>
            {data.budgetStatus === 'under' ? 'Under' : 'Over'}
            {data.budgetGap != null && ` ${symbol}${formatCompact(Math.abs(data.budgetGap))}`}
          </span>
        )
      }
      return <span className="text-sm text-muted-foreground">—</span>
    }
    if (sectionId === 'income-vs-expenses') {
      if (loading) return <Skeleton className="h-6 w-28" />
      if (data.incomeTotal != null && data.expensesTotal != null) {
        return (
          <span className="text-2xl font-bold tabular-nums">
            {symbol}{formatCompact(data.incomeTotal - data.expensesTotal)}
          </span>
        )
      }
      return <span className="text-sm text-muted-foreground">—</span>
    }
    if (sectionId === 'annual-trends' || sectionId === 'monthly-trends') {
      return <span className="text-sm text-muted-foreground">View section</span>
    }
    return null
  }

  const primarySections = [
    { id: 'net-worth-chart', label: data.hasTrustData ? 'Net Worth (incl. Trust)' : 'Net Worth', labelShort: 'Net Worth', icon: LineChart },
    { id: 'budget-table', label: 'Budget (Net Income)', labelShort: 'Budget', icon: Receipt },
    { id: 'income-vs-expenses', label: 'Income vs Expenses', labelShort: 'Cash Flow', icon: Receipt },
  ]

  const trendSections = SECTIONS_BASE.filter((section) => section.id !== 'budget-table')

  const sectionsToRender = isMobile
    ? [...primarySections, ...(showTrendShortcuts ? trendSections : [])]
    : [
        { id: 'net-worth-chart', label: data.hasTrustData ? 'Net Worth (incl. Trust)' : 'Net Worth', labelShort: 'Net Worth', icon: LineChart },
        ...SECTIONS_BASE,
      ]

  return (
    <Card className="border-2">
      <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30">
        <CardTitle className="text-2xl font-bold">Executive Summary</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Key takeaways at a glance. On mobile, detailed trend shortcuts are optional.
        </p>
      </CardHeader>
      <CardContent className="pt-6">
        <div className={cn(
          'grid gap-4',
          'md:grid-cols-2 lg:grid-cols-4',
          'max-md:flex max-md:gap-4 max-md:overflow-x-auto max-md:pb-2 max-md:snap-x max-md:snap-mandatory max-md:-mx-1 max-md:px-1'
        )}>
          {sectionsToRender.map((section) => {
            const Icon = section.icon
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => scrollToSection(section.id === 'income-vs-expenses' ? 'net-worth-chart' : section.id)}
                className={cn(
                  'flex flex-col items-start gap-2 p-4 rounded-lg border bg-card text-left w-full min-w-0 transition-all',
                  'hover:shadow-md hover:border-primary/50 hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                  'max-md:shrink-0 max-md:min-w-[85%] max-md:max-w-[85%] max-md:snap-center'
                )}
                aria-label={`${section.label} summary, jump to ${section.label} section`}
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <div className="flex flex-col items-start gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                      <span className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                        {section.labelShort || section.label.replace(/\s*\([^)]*\)\s*/g, '').trim()}
                      </span>
                    </div>
                    {section.label.includes('(') && (
                      <span className="text-[10px] text-muted-foreground/70 ml-7">
                        {section.label.match(/\(([^)]+)\)/)?.[1] || ''}
                      </span>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                </div>
                <div className="w-full">
                  {getCardContent(section.id)}
                  {section.id === 'budget-table' && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {loading ||
                      data.dailyNeutralBudget == null ||
                      data.dailyUsedBudget == null ||
                      data.dailyUsedPercent == null
                        ? ''
                        : (
                            <>
                              Today neutral {symbol}{formatCompact(data.dailyNeutralBudget)} · used {symbol}
                              {formatCompact(data.dailyUsedBudget)} ({formatPercent(data.dailyUsedPercent)}) ·{' '}
                              <span
                                className={cn(
                                  data.dailyForecastDirection === 'improving' && 'text-green-600',
                                  data.dailyForecastDirection === 'worsening' && 'text-red-600'
                                )}
                              >
                                {data.dailyForecastDirection === 'improving'
                                  ? 'improving'
                                  : data.dailyForecastDirection === 'worsening'
                                    ? 'worsening'
                                    : 'flat'}
                              </span>
                            </>
                          )}
                    </p>
                  )}
                  {section.id === 'income-vs-expenses' && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {loading || data.incomeTotal == null || data.expensesTotal == null
                        ? ''
                        : `${symbol}${formatCompact(data.incomeTotal)} income vs ${symbol}${formatCompact(data.expensesTotal)} expenses`}
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
        {isMobile && (
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowTrendShortcuts((v) => !v)}
            >
              {showTrendShortcuts ? 'Hide trend shortcuts' : 'Show trend shortcuts'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
