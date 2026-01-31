'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrency } from '@/lib/contexts/currency-context'
import { LineChart, Receipt, TrendingUp } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { HistoricalNetWorth } from '@/lib/types'
import { cn } from '@/utils/cn'

function scrollToSection(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const main = document.querySelector('main')
  if (main) {
    const y = el.getBoundingClientRect().top + main.scrollTop - 80
    main.scrollTo({ top: y, behavior: 'smooth' })
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

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
      if (budgetRes.data?.length) {
        budgetRes.data.forEach((row: { category: string; tracking_est_gbp: number }) => {
          const tracking = currency === 'USD' ? convertAmount(row.tracking_est_gbp, 'GBP', fxRate) : row.tracking_est_gbp
          if (row.category === 'Income' || row.category === 'Gift Money') {
            incomeTotal += Math.abs(tracking)
          } else {
            expensesTotal += Math.abs(tracking)
          }
        })
      }
      const netIncome = incomeTotal - expensesTotal
      const budgetStatus = netIncome >= 0 ? 'under' : 'over'
      const budgetGap = netIncome
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

  return (
    <div className="md:hidden mb-4">
      <p className="text-xs text-muted-foreground mb-2 font-medium">At a glance</p>
      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory -mx-1 px-1">
        <button
          type="button"
          onClick={() => scrollToSection('net-worth-chart')}
          className="flex flex-col items-start gap-1 rounded-lg border-2 border-border bg-card p-3 text-left transition-colors hover:bg-muted/50 active:scale-[0.98] min-h-[52px] min-w-[40%] shrink-0 snap-center"
        >
          <LineChart className="h-4 w-4 text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Net Worth</span>
          {loading ? (
            <Skeleton className="h-5 w-12" />
          ) : data.netWorth != null ? (
            <span className="text-sm font-bold leading-tight">{symbol}{formatCompact(data.netWorth)}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => scrollToSection('budget-table')}
          className="flex flex-col items-start gap-1 rounded-lg border-2 border-border bg-card p-3 text-left transition-colors hover:bg-muted/50 active:scale-[0.98] min-h-[52px] min-w-[40%] shrink-0 snap-center"
        >
          <Receipt className="h-4 w-4 text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Budget</span>
          {loading ? (
            <Skeleton className="h-5 w-16" />
          ) : data.budgetStatus ? (
            <span className={cn('text-sm font-bold leading-tight', data.budgetStatus === 'under' ? 'text-green-600' : 'text-red-600')}>
              {data.budgetStatus === 'under' ? 'Under' : 'Over'} {data.budgetGap != null && `${symbol}${formatCompact(Math.abs(data.budgetGap))}`}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => scrollToSection('net-worth-chart')}
          className="flex flex-col items-start gap-1 rounded-lg border-2 border-border bg-card p-3 text-left transition-colors hover:bg-muted/50 active:scale-[0.98] min-h-[52px] min-w-[40%] shrink-0 snap-center"
        >
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Income vs Exp</span>
          {loading ? (
            <Skeleton className="h-5 w-12" />
          ) : data.incomeTotal != null && data.expensesTotal != null ? (
            <span className="text-sm font-bold leading-tight">{symbol}{formatCompact(data.incomeTotal)} / {symbol}{formatCompact(data.expensesTotal)}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </button>
      </div>
    </div>
  )
}
