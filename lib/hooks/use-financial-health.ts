'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useAccounts } from '@/lib/hooks/queries/use-accounts'
import { useCashRunway } from '@/lib/hooks/queries/use-cash-runway'
import type { AccountBalance } from '@/lib/types'
import type { FinancialHealthData } from '@/components/financial-health-banner'
import { createClient } from '@/lib/supabase/client'

type NwRow = { date: string; category: string; amount_gbp: number | null; amount_usd: number | null }

const CASH_CATEGORIES = ['Cash', 'Checking', 'Savings']

function useHistoricalNetWorth() {
  return useQuery({
    queryKey: ['historical-net-worth-summary'],
    queryFn: async (): Promise<NwRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('historical_net_worth')
        .select('date, category, amount_gbp, amount_usd')
        .order('date', { ascending: false })
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
}

export function useFinancialHealth(): { data: FinancialHealthData | null; loading: boolean } {
  const { currency, fxRate, convertAmount } = useCurrency()
  const { data: accountsRaw, isLoading: accountsLoading } = useAccounts()
  const { data: historicalNw, isLoading: nwLoading } = useHistoricalNetWorth()
  const { data: burnRes, isLoading: burnLoading } = useCashRunway()

  const loading = accountsLoading || nwLoading || burnLoading
  const accounts = accountsRaw ?? null
  const burnData = burnRes
    ? { gbpNet: Number(burnRes.gbpNet ?? 0), usdNet: Number(burnRes.usdNet ?? 0) }
    : null

  const data = useMemo((): FinancialHealthData | null => {
    if (!accounts || !historicalNw) return null

    const symbol = currency === 'USD' ? '$' : '£'

    const accountsMap = new Map<string, AccountBalance>()
    accounts.forEach((a) => {
      const key = `${a.institution}-${a.account_name}`
      const existing = accountsMap.get(key)
      if (!existing || new Date(a.date_updated) > new Date(existing.date_updated)) {
        accountsMap.set(key, a)
      }
    })
    const latest = Array.from(accountsMap.values())

    const currentNw = latest.reduce((sum, a) => {
      if (a.category === 'Trust') return sum
      return sum + convertAmount(a.balance_total_local, a.currency, fxRate)
    }, 0)

    const currentYear = new Date().getFullYear()
    const lastYear = currentYear - 1
    const latestByYearCat = new Map<string, { date: string; amount: number }>()
    historicalNw.forEach((item) => {
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

    const lastYearNw =
      (latestByYearCat.get(`${lastYear}|Personal`)?.amount ?? 0) +
      (latestByYearCat.get(`${lastYear}|Family`)?.amount ?? 0)
    const vsLastYear = lastYearNw !== 0 ? currentNw - lastYearNw : null
    const vsLastYearPct = lastYearNw !== 0 && vsLastYear != null
      ? (vsLastYear / Math.abs(lastYearNw)) * 100
      : null

    let cashRunwayMonths: number | null = null
    if (burnData) {
      const cashByCurrency = { GBP: 0, USD: 0 }
      latest.forEach((a) => {
        if (CASH_CATEGORIES.includes(a.category)) {
          const cur = a.currency.toUpperCase() as 'GBP' | 'USD'
          if (cur === 'GBP' || cur === 'USD') {
            cashByCurrency[cur] += a.balance_total_local || 0
          }
        }
      })
      const totalCash = currency === 'USD'
        ? cashByCurrency.USD + convertAmount(cashByCurrency.GBP, 'GBP', fxRate)
        : cashByCurrency.GBP + convertAmount(cashByCurrency.USD, 'USD', 1 / fxRate)
      const gbpBurn = Math.max(0, -burnData.gbpNet) / 3
      const usdBurn = Math.max(0, -burnData.usdNet) / 3
      const totalBurn = currency === 'USD'
        ? usdBurn + convertAmount(gbpBurn, 'GBP', fxRate)
        : gbpBurn + convertAmount(usdBurn, 'USD', 1 / fxRate)
      cashRunwayMonths = totalBurn > 0 ? totalCash / totalBurn : (totalCash > 0 ? Infinity : 0)
    }

    return {
      netWorth: currentNw,
      netWorthVsLastYear: vsLastYear,
      netWorthVsLastYearPercent: vsLastYearPct,
      cashRunwayMonths,
      budgetGap: null,
      budgetTotal: null,
      currencySymbol: symbol,
    }
  }, [accounts, historicalNw, burnData, currency, fxRate, convertAmount])

  return { data, loading }
}
