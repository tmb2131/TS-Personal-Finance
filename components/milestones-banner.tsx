'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrency } from '@/lib/contexts/currency-context'
import { Star, TrendingUp, Award } from 'lucide-react'
import { cn } from '@/utils/cn'

type Milestone = {
  icon: typeof Star
  text: string
}

export function MilestonesBanner() {
  const { currency, fxRate, convertAmount } = useCurrency()
  const [accounts, setAccounts] = useState<any[] | null>(null)
  const [historicalNw, setHistoricalNw] = useState<any[] | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetch_() {
      const supabase = createClient()
      const [acctRes, nwRes] = await Promise.all([
        supabase
          .from('account_balances')
          .select('institution, account_name, category, currency, balance_total_local, date_updated')
          .order('date_updated', { ascending: false }),
        supabase
          .from('historical_net_worth')
          .select('date, category, amount_gbp, amount_usd')
          .order('date', { ascending: false }),
      ])
      if (cancelled) return
      setAccounts(acctRes.data ?? [])
      setHistoricalNw(nwRes.data ?? [])
    }
    fetch_()
    return () => { cancelled = true }
  }, [])

  const milestones = useMemo((): Milestone[] => {
    if (!accounts || !historicalNw) return []

    const result: Milestone[] = []
    const formatCompact = (v: number) => {
      const sym = currency === 'USD' ? '$' : '£'
      const abs = Math.abs(v)
      if (abs >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(1)}M`
      if (abs >= 1_000) return `${sym}${(v / 1_000).toFixed(1)}k`
      return `${sym}${Math.round(v)}`
    }

    const accountsMap = new Map<string, any>()
    accounts.forEach((a: any) => {
      const key = `${a.institution}-${a.account_name}`
      const existing = accountsMap.get(key)
      if (!existing || new Date(a.date_updated) > new Date(existing.date_updated)) {
        accountsMap.set(key, a)
      }
    })
    const latest = Array.from(accountsMap.values())

    const currentNw = latest.reduce((sum: number, a: any) => {
      if (a.category === 'Trust') return sum
      return sum + convertAmount(a.balance_total_local, a.currency, fxRate)
    }, 0)

    const currentYear = new Date().getFullYear()
    const latestByYearCat = new Map<string, { date: string; amount: number }>()
    historicalNw.forEach((item: any) => {
      const date = new Date(item.date)
      const year = date.getFullYear()
      const cat = item.category
      if (cat !== 'Personal' && cat !== 'Family') return
      const amount = currency === 'USD' ? (item.amount_usd || 0) : (item.amount_gbp || 0)
      const dateKey = date.toISOString().slice(0, 10)
      const key = `${year}|${cat}`
      const existing = latestByYearCat.get(key)
      if (!existing || dateKey > existing.date) {
        latestByYearCat.set(key, { date: dateKey, amount })
      }
    })

    const historicalTotals = new Map<number, number>()
    const years = new Set<number>()
    latestByYearCat.forEach((_v, key) => {
      const year = Number(key.split('|')[0])
      years.add(year)
    })
    years.forEach((year) => {
      const p = latestByYearCat.get(`${year}|Personal`)?.amount ?? 0
      const f = latestByYearCat.get(`${year}|Family`)?.amount ?? 0
      historicalTotals.set(year, p + f)
    })

    const allTimeHigh = Math.max(...Array.from(historicalTotals.values()), 0)
    if (currentNw > allTimeHigh && allTimeHigh > 0) {
      result.push({
        icon: Star,
        text: `Net worth is at an all-time high of ${formatCompact(currentNw)}`,
      })
    }

    const lastYear = currentYear - 1
    const lastYearNw = historicalTotals.get(lastYear) ?? 0
    if (lastYearNw > 0 && currentNw > lastYearNw) {
      const growth = ((currentNw - lastYearNw) / lastYearNw) * 100
      if (growth >= 10) {
        result.push({
          icon: TrendingUp,
          text: `Net worth has grown ${growth.toFixed(0)}% since year-end ${lastYear}`,
        })
      }
    }

    const twoYearsAgo = historicalTotals.get(currentYear - 2) ?? 0
    if (twoYearsAgo > 0 && currentNw > 0) {
      const twoYearGrowth = ((currentNw - twoYearsAgo) / twoYearsAgo) * 100
      if (twoYearGrowth >= 25) {
        result.push({
          icon: Award,
          text: `Net worth has grown ${twoYearGrowth.toFixed(0)}% over the past 2 years`,
        })
      }
    }

    return result.slice(0, 2)
  }, [accounts, historicalNw, currency, fxRate, convertAmount])

  if (milestones.length === 0) return null

  return (
    <div className="space-y-1.5">
      {milestones.map((m, i) => {
        const Icon = m.icon
        return (
          <div
            key={i}
            className={cn(
              'flex items-center gap-2.5 rounded-lg border border-l-[3px] border-l-amber-400 bg-gradient-to-r from-amber-500/8 via-amber-500/4 to-transparent px-3.5 py-2.5'
            )}
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
              <Icon className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <p className="text-xs font-medium text-foreground">{m.text}</p>
          </div>
        )
      })}
    </div>
  )
}
