'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrency } from '@/lib/contexts/currency-context'
import { LineChart, Receipt, Calendar, CalendarDays, ChevronRight } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HistoricalNetWorth } from '@/lib/types'
import { cn } from '@/utils/cn'

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

const SECTIONS = [
  { id: 'net-worth-chart', label: 'Net Worth (incl. Trust)', labelShort: 'Net Worth', icon: LineChart },
  { id: 'budget-table', label: 'Budget (Net Income)', labelShort: 'Budget', icon: Receipt },
  { id: 'annual-trends', label: 'Annual Trends', labelShort: 'Annual', icon: Calendar },
  { id: 'monthly-trends', label: 'Monthly Trends', labelShort: 'Monthly', icon: CalendarDays },
] as const

export function DashboardAtAGlance() {
  const { currency, fxRate, convertAmount } = useCurrency()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{
    netWorth: number | null
    budgetStatus: 'under' | 'over' | null
    budgetGap: number | null
    incomeTotal: number | null
    expensesTotal: number | null
  }>({ netWorth: null, budgetStatus: null, budgetGap: null, incomeTotal: null, expensesTotal: null })

  useEffect(() => {
    let cancelled = false
    async function fetchSummary() {
      const supabase = createClient()
      const [nwRes, budgetRes] = await Promise.all([
        supabase.from('historical_net_worth').select('*').order('date', { ascending: false }).limit(500),
        supabase.from('budget_targets').select('category, annual_budget_gbp, tracking_est_gbp'),
      ])
      if (cancelled) return
      let netWorth: number | null = null
      if (nwRes.data?.length) {
        const byYear = (nwRes.data as HistoricalNetWorth[]).reduce<Record<number, number>>((acc, item) => {
          const year = new Date(item.date).getFullYear()
          const amt = currency === 'USD' ? (item.amount_usd ?? 0) : (item.amount_gbp ?? 0)
          acc[year] = (acc[year] ?? 0) + amt
          return acc
        }, {})
        const latestYear = Math.max(...Object.keys(byYear).map(Number))
        netWorth = byYear[latestYear] ?? null
      }
      let incomeTotal = 0
      let expensesTotal = 0
      let incomeBudget = 0
      let expensesBudget = 0
      if (budgetRes.data?.length) {
        budgetRes.data.forEach((row: { category: string; annual_budget_gbp: number; tracking_est_gbp: number }) => {
          const tracking = currency === 'USD' ? convertAmount(row.tracking_est_gbp, 'GBP', fxRate) : row.tracking_est_gbp
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
      setData({
        netWorth,
        budgetStatus,
        budgetGap,
        incomeTotal: incomeTotal || null,
        expensesTotal: expensesTotal || null,
      })
      setLoading(false)
    }
    fetchSummary()
    return () => { cancelled = true }
  }, [currency, fxRate, convertAmount])

  const formatCompact = (value: number) => {
    const abs = Math.abs(value)
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`
    return value.toFixed(0)
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
    if (sectionId === 'annual-trends' || sectionId === 'monthly-trends') {
      return <span className="text-sm text-muted-foreground">View section</span>
    }
    return null
  }

  return (
    <Card className="border-2">
      <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30">
        <CardTitle className="text-2xl font-bold">Executive Summary</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">Key takeaways at a glance — click a card to jump to the section</p>
      </CardHeader>
      <CardContent className="pt-6">
        <div className={cn(
          'grid gap-4',
          'md:grid-cols-2 lg:grid-cols-4',
          'max-md:flex max-md:gap-4 max-md:overflow-x-auto max-md:pb-2 max-md:snap-x max-md:snap-mandatory max-md:-mx-1 max-md:px-1'
        )}>
          {SECTIONS.map((section) => {
            const Icon = section.icon
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => scrollToSection(section.id)}
                className={cn(
                  'flex flex-col items-start gap-2 p-4 rounded-lg border bg-card text-left w-full min-w-0 transition-all',
                  'hover:shadow-md hover:border-primary/50 hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                  'max-md:shrink-0 max-md:min-w-[85%] max-md:max-w-[85%] max-md:snap-center'
                )}
                aria-label={`${section.label} summary, jump to ${section.label} section`}
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                    <span className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                      {section.label}
                    </span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                </div>
                <div className="w-full">
                  {getCardContent(section.id)}
                </div>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
