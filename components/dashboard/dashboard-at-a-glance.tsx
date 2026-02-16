'use client'

import { useState } from 'react'
import { useCurrency } from '@/lib/contexts/currency-context'
import { LineChart, Receipt, Calendar, CalendarDays, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'

export type DashboardAtAGlanceData = {
  netWorthGbp: number | null
  netWorthUsd: number | null
  hasTrustData: boolean
  incomeForecastGbp: number
  expensesForecastGbp: number
  incomeBudgetGbp: number
  expensesBudgetGbp: number
  dailyNeutralBudgetGbp: number | null
  dailyUsedBudgetGbp: number | null
  dailyUsedPercent: number | null
  dailyForecastDirection: 'improving' | 'worsening' | 'flat' | null
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

export function DashboardAtAGlance({ data }: { data: DashboardAtAGlanceData | null }) {
  const { currency, fxRate, convertAmount } = useCurrency()
  const isMobile = useIsMobile()
  const [showTrendShortcuts, setShowTrendShortcuts] = useState(false)

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

  const toDisplayCurrency = (gbpValue: number) =>
    currency === 'USD' ? convertAmount(gbpValue, 'GBP', fxRate) : gbpValue

  // Derive display values from server-provided data
  const netWorth = data
    ? (currency === 'USD' ? data.netWorthUsd : data.netWorthGbp)
    : null
  const hasTrustData = data?.hasTrustData ?? false

  const incomeTotal = data ? toDisplayCurrency(data.incomeForecastGbp) : null
  const expensesTotal = data ? toDisplayCurrency(data.expensesForecastGbp) : null

  const netIncomeTracking = data ? toDisplayCurrency(data.incomeForecastGbp - data.expensesForecastGbp) : null
  const netIncomeBudget = data ? toDisplayCurrency(data.incomeBudgetGbp - data.expensesBudgetGbp) : null
  const budgetGap = netIncomeTracking != null && netIncomeBudget != null ? netIncomeTracking - netIncomeBudget : null
  const budgetStatus = budgetGap != null ? (budgetGap >= 0 ? 'under' : 'over') : null

  const dailyNeutralBudget = data?.dailyNeutralBudgetGbp != null ? Math.max(0, toDisplayCurrency(data.dailyNeutralBudgetGbp)) : null
  const dailyUsedBudget = data?.dailyUsedBudgetGbp != null ? toDisplayCurrency(data.dailyUsedBudgetGbp) : null
  const dailyUsedPercent = data?.dailyUsedPercent ?? null
  const dailyForecastDirection = data?.dailyForecastDirection ?? null

  const loading = data === null

  const getCardContent = (sectionId: string) => {
    if (sectionId === 'net-worth-chart') {
      if (loading) return <span className="text-sm text-muted-foreground">Loading...</span>
      if (netWorth != null) return <span className="text-2xl font-bold tabular-nums">{symbol}{formatCompact(netWorth)}</span>
      return <span className="text-sm text-muted-foreground">&mdash;</span>
    }
    if (sectionId === 'budget-table') {
      if (loading) return <span className="text-sm text-muted-foreground">Loading...</span>
      if (budgetStatus) {
        return (
          <span className={cn('text-2xl font-bold tabular-nums', budgetStatus === 'under' ? 'text-green-600' : 'text-red-600')}>
            {budgetStatus === 'under' ? 'Under' : 'Over'}
            {budgetGap != null && ` ${symbol}${formatCompact(Math.abs(budgetGap))}`}
          </span>
        )
      }
      return <span className="text-sm text-muted-foreground">&mdash;</span>
    }
    if (sectionId === 'income-vs-expenses') {
      if (loading) return <span className="text-sm text-muted-foreground">Loading...</span>
      if (incomeTotal != null && expensesTotal != null) {
        return (
          <span className="text-2xl font-bold tabular-nums">
            {symbol}{formatCompact(incomeTotal - expensesTotal)}
          </span>
        )
      }
      return <span className="text-sm text-muted-foreground">&mdash;</span>
    }
    if (sectionId === 'annual-trends' || sectionId === 'monthly-trends') {
      return <span className="text-sm text-muted-foreground">View section</span>
    }
    return null
  }

  const primarySections = [
    { id: 'net-worth-chart', label: hasTrustData ? 'Net Worth (incl. Trust)' : 'Net Worth', labelShort: 'Net Worth', icon: LineChart },
    { id: 'budget-table', label: 'Budget (Net Income)', labelShort: 'Budget', icon: Receipt },
    { id: 'income-vs-expenses', label: 'Income vs Expenses', labelShort: 'Cash Flow', icon: Receipt },
  ]

  const trendSections = SECTIONS_BASE.filter((section) => section.id !== 'budget-table')

  const sectionsToRender = isMobile
    ? [...primarySections, ...(showTrendShortcuts ? trendSections : [])]
    : [
        { id: 'net-worth-chart', label: hasTrustData ? 'Net Worth (incl. Trust)' : 'Net Worth', labelShort: 'Net Worth', icon: LineChart },
        ...SECTIONS_BASE,
      ]

  return (
    <Card className="border-2">
      <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30">
        <CardTitle className="text-xl font-semibold">Executive Summary</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Key takeaways at a glance. On mobile, detailed trend shortcuts are optional.
        </p>
      </CardHeader>
      <CardContent className="pt-6 md:pt-6">
        <div className={cn(
          'grid gap-4',
          'md:grid-cols-2 lg:grid-cols-4',
          'max-md:flex max-md:gap-4 max-md:overflow-x-auto max-md:pb-2 max-md:snap-x max-md:snap-mandatory max-md:-mx-1 max-md:px-1'
        )}>
          {sectionsToRender.map((section) => {
            const Icon = section.icon
            const pillColor: Record<string, string> = {
              'net-worth-chart': 'bg-blue-500/15',
              'budget-table': 'bg-purple-500/15',
              'income-vs-expenses': 'bg-orange-500/15',
              'annual-trends': 'bg-indigo-500/15',
              'monthly-trends': 'bg-indigo-500/15',
            }
            const iconColor: Record<string, string> = {
              'net-worth-chart': 'text-blue-600',
              'budget-table': 'text-purple-600',
              'income-vs-expenses': 'text-orange-600',
              'annual-trends': 'text-indigo-600',
              'monthly-trends': 'text-indigo-600',
            }
            const borderColor = (() => {
              if (section.id === 'net-worth-chart') return 'border-l-blue-500'
              if (section.id === 'budget-table') return budgetStatus === 'under' ? 'border-l-green-500' : budgetStatus === 'over' ? 'border-l-red-500' : 'border-l-purple-500'
              if (section.id === 'income-vs-expenses') return 'border-l-orange-500'
              return 'border-l-muted-foreground/30'
            })()
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => scrollToSection(section.id === 'income-vs-expenses' ? 'net-worth-chart' : section.id)}
                className={cn(
                  'flex flex-col items-start gap-2 p-5 rounded-lg border border-l-[3px] bg-card text-left w-full min-w-0 transition-all',
                  borderColor,
                  'hover:shadow-md hover:border-primary/50 hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                  'max-md:shrink-0 max-md:min-w-[85%] max-md:max-w-[85%] max-md:snap-center'
                )}
                aria-label={`${section.label} summary, jump to ${section.label} section`}
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <div className="flex flex-col items-start gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className={cn('flex h-8 w-8 items-center justify-center rounded-full shrink-0', pillColor[section.id] || 'bg-muted')}>
                        <Icon className={cn('h-5 w-5 shrink-0', iconColor[section.id] || 'text-muted-foreground')} />
                      </div>
                      <span className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                        {section.labelShort || section.label.replace(/\s*\([^)]*\)\s*/g, '').trim()}
                      </span>
                    </div>
                    {section.label.includes('(') && (
                      <span className="text-[10px] text-muted-foreground/70 ml-10">
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
                      dailyNeutralBudget == null ||
                      dailyUsedBudget == null ||
                      dailyUsedPercent == null
                        ? ''
                        : (
                            <>
                              Today neutral {symbol}{formatCompact(dailyNeutralBudget)} &middot; used {symbol}
                              {formatCompact(dailyUsedBudget)} ({formatPercent(dailyUsedPercent)}) &middot;{' '}
                              <span
                                className={cn(
                                  dailyForecastDirection === 'improving' && 'text-green-600',
                                  dailyForecastDirection === 'worsening' && 'text-red-600'
                                )}
                              >
                                {dailyForecastDirection === 'improving'
                                  ? 'improving'
                                  : dailyForecastDirection === 'worsening'
                                    ? 'worsening'
                                    : 'flat'}
                              </span>
                            </>
                          )}
                    </p>
                  )}
                  {section.id === 'income-vs-expenses' && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {loading || incomeTotal == null || expensesTotal == null
                        ? ''
                        : `${symbol}${formatCompact(incomeTotal)} income vs ${symbol}${formatCompact(expensesTotal)} expenses`}
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
