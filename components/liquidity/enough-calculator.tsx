'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useAccounts } from '@/lib/hooks/queries/use-accounts'
import { useDailySummary } from '@/lib/hooks/queries/use-daily-summary'
import type { AccountBalance } from '@/lib/types'
import { Info, Shield, TrendingUp } from 'lucide-react'
import { cn } from '@/utils/cn'

const INFLATION_RATE = 0.03
const LIQUID_CATEGORIES = ['Cash', 'Checking', 'Savings', 'Brokerage']
const EXCLUDED_EXPENSE_CATEGORIES = ['Income', 'Gift Money', 'Other Income', 'Excluded']
type ReturnProfile = 'Conservative' | 'Base' | 'Optimistic'
type ReturnAssumptions = {
  defaultNominalReturn: number
  nominalReturns: Record<string, number>
}
const RETURN_PROFILE_OPTIONS: ReturnProfile[] = ['Conservative', 'Base', 'Optimistic']
const RETURN_ASSUMPTIONS_BY_PROFILE: Record<ReturnProfile, ReturnAssumptions> = {
  Conservative: {
    defaultNominalReturn: 0.03,
    nominalReturns: {
      Cash: 0.02,
      Checking: 0.02,
      Savings: 0.02,
      Brokerage: 0.06,
      Retirement: 0.06,
      'Alt Inv': 0.05,
      Taconic: 0.05,
      House: 0.03,
      Property: 0.03,
      Other: 0.03,
    },
  },
  Base: {
    defaultNominalReturn: 0.04,
    nominalReturns: {
      Cash: 0.03,
      Checking: 0.03,
      Savings: 0.03,
      Brokerage: 0.07,
      Retirement: 0.07,
      'Alt Inv': 0.06,
      Taconic: 0.06,
      House: 0.04,
      Property: 0.04,
      Other: 0.04,
    },
  },
  Optimistic: {
    defaultNominalReturn: 0.05,
    nominalReturns: {
      Cash: 0.04,
      Checking: 0.04,
      Savings: 0.04,
      Brokerage: 0.08,
      Retirement: 0.08,
      'Alt Inv': 0.07,
      Taconic: 0.07,
      House: 0.05,
      Property: 0.05,
      Other: 0.05,
    },
  },
}

type AssetMixEntry = {
  category: string
  balance: number
}

function nominalToRealReturn(nominalReturn: number, inflationRate = INFLATION_RATE) {
  return (1 + nominalReturn) / (1 + inflationRate) - 1
}

function weightedRealReturn(
  assets: AssetMixEntry[],
  assumptions: ReturnAssumptions,
  inflationRate = INFLATION_RATE
) {
  const total = assets.reduce((sum, asset) => sum + asset.balance, 0)
  if (total <= 0) return 0

  const weightedNominal = assets.reduce((sum, asset) => {
    const rate = assumptions.nominalReturns[asset.category] ?? assumptions.defaultNominalReturn
    return sum + (asset.balance / total) * rate
  }, 0)

  return nominalToRealReturn(weightedNominal, inflationRate)
}

function computeYearsUntilDepletion(
  portfolio: number,
  annualWithdrawal: number,
  realReturn: number,
  maxYears = 100
) {
  if (annualWithdrawal <= 0) return maxYears
  if (portfolio <= 0) return 0

  let balance = portfolio
  for (let year = 1; year <= maxYears; year++) {
    balance = balance * (1 + realReturn) - annualWithdrawal
    if (balance <= 0) return year
  }

  return maxYears
}

export function EnoughCalculator() {
  const { currency, fxRate, convertAmount } = useCurrency()
  const { data: accountsData, isLoading: accountsLoading } = useAccounts()
  const { data: dailySummaryData, isLoading: dailySummaryLoading } = useDailySummary()
  const loading = accountsLoading || dailySummaryLoading
  const [returnProfile, setReturnProfile] = useState<ReturnProfile>('Conservative')

  const {
    netWorth,
    liquidAssets,
    annualIncome,
    annualGiftMoney,
    annualExpenses,
    annualNetOutflow,
    totalAssetMix,
    liquidAssetMix,
  } = useMemo(() => {
    const accounts = accountsData ?? []
    const accountsMap = new Map<string, AccountBalance>()
    accounts.forEach((a) => {
      const key = `${a.institution}-${a.account_name}`
      const existing = accountsMap.get(key)
      if (!existing || new Date(a.date_updated) > new Date(existing.date_updated)) {
        accountsMap.set(key, a)
      }
    })
    const latest = Array.from(accountsMap.values())
    const converted = latest.map((a) => ({
      ...a,
      balanceConverted: convertAmount(a.balance_total_local, a.currency, fxRate),
    }))

    const nw = converted.reduce((sum, a) => {
      if (a.category === 'Trust') return sum
      return sum + a.balanceConverted
    }, 0)
    const totalMix = converted
      .filter((a) => a.category !== 'Trust' && a.balanceConverted > 0)
      .map((a) => ({ category: a.category, balance: a.balanceConverted }))

    const liquid = converted.reduce((sum, a) => {
      if (!LIQUID_CATEGORIES.includes(a.category)) return sum
      return sum + a.balanceConverted
    }, 0)
    const liquidMix = converted
      .filter((a) => LIQUID_CATEGORIES.includes(a.category) && a.balanceConverted > 0)
      .map((a) => ({ category: a.category, balance: a.balanceConverted }))

    let estimatedIncome = 0
    let estimatedGiftMoney = 0
    let estimatedExpenses = 0
    if (dailySummaryData?.forecastByCategory) {
      const rows = Array.isArray(dailySummaryData.forecastByCategory)
        ? dailySummaryData.forecastByCategory
        : []
      for (const row of rows) {
        const forecastGBP = Number(row?.forecast ?? 0)
        if (!Number.isFinite(forecastGBP)) continue

        if (row.category === 'Income') {
          estimatedIncome += Math.abs(forecastGBP)
          continue
        }
        if (row.category === 'Gift Money') {
          estimatedGiftMoney += Math.abs(forecastGBP)
          continue
        }
        if (EXCLUDED_EXPENSE_CATEGORIES.includes(row.category)) continue
        estimatedExpenses += Math.abs(forecastGBP)
      }
    }

    const toDisplayCurrency = (valueGBP: number) =>
      currency === 'USD' ? convertAmount(valueGBP, 'GBP', fxRate) : valueGBP

    const incomeDisplay = toDisplayCurrency(estimatedIncome)
    const giftMoneyDisplay = toDisplayCurrency(estimatedGiftMoney)
    const expensesDisplay = toDisplayCurrency(estimatedExpenses)
    const netOutflow = Math.max(0, expensesDisplay - incomeDisplay - giftMoneyDisplay)

    return {
      netWorth: nw,
      liquidAssets: liquid,
      annualIncome: incomeDisplay,
      annualGiftMoney: giftMoneyDisplay,
      annualExpenses: expensesDisplay,
      annualNetOutflow: netOutflow,
      totalAssetMix: totalMix,
      liquidAssetMix: liquidMix,
    }
  }, [accountsData, dailySummaryData, currency, fxRate, convertAmount])

  const metrics = useMemo(() => {
    const assumptions = RETURN_ASSUMPTIONS_BY_PROFILE[returnProfile]
    const totalRealReturn = weightedRealReturn(totalAssetMix, assumptions)
    const liquidRealReturn = weightedRealReturn(liquidAssetMix, assumptions)
    const yearsTotal = computeYearsUntilDepletion(netWorth, annualNetOutflow, totalRealReturn)
    const yearsLiquid = computeYearsUntilDepletion(liquidAssets, annualNetOutflow, liquidRealReturn)
    const totalBreakevenExpenses =
      annualIncome + annualGiftMoney + Math.max(0, netWorth * totalRealReturn)
    const liquidBreakevenExpenses =
      annualIncome + annualGiftMoney + Math.max(0, liquidAssets * liquidRealReturn)
    return {
      yearsTotal,
      yearsLiquid,
      totalRealReturn,
      liquidRealReturn,
      totalBreakevenExpenses,
      liquidBreakevenExpenses,
    }
  }, [
    netWorth,
    liquidAssets,
    annualNetOutflow,
    totalAssetMix,
    liquidAssetMix,
    returnProfile,
    annualIncome,
    annualGiftMoney,
  ])

  const symbol = currency === 'USD' ? '$' : '£'
  const formatCompact = (v: number) => {
    const abs = Math.abs(v)
    if (abs >= 1_000_000) return `${symbol}${(v / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000) return `${symbol}${(v / 1_000).toFixed(1)}k`
    return `${symbol}${Math.round(v)}`
  }

  if (loading) {
    return (
      <Card className="border-l-[3px] border-l-indigo-500">
        <CardHeader>
          <CardTitle className="text-base">Financial Independence</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!metrics) {
    return null
  }

  const yearsLabel = (y: number) =>
    y >= 100 ? '100+ years' : y >= 10 ? `${Math.round(y)} years` : `${y.toFixed(1)} years`
  const returnLabel = (realReturn: number) => `${realReturn >= 0 ? '+' : ''}${(realReturn * 100).toFixed(1)}% real return`
  const percentLabel = (value: number) => `${(value * 100).toFixed(0)}%`

  return (
    <Card className="border-l-[3px] border-l-indigo-500">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-indigo-600" />
          Financial Independence
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          How long your assets could sustain your current lifestyle without income
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground">Return assumptions:</span>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="View return rate assumptions"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border text-muted-foreground hover:text-foreground"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm p-3 text-left">
                <div className="space-y-1">
                  <p className="font-semibold">Nominal return assumptions</p>
                  <p>Inflation assumption: {percentLabel(INFLATION_RATE)}</p>
                  <p>Cash / Checking / Savings: C {percentLabel(0.02)} | B {percentLabel(0.03)} | O {percentLabel(0.04)}</p>
                  <p>Brokerage / Retirement: C {percentLabel(0.06)} | B {percentLabel(0.07)} | O {percentLabel(0.08)}</p>
                  <p>Alt Inv / Taconic: C {percentLabel(0.05)} | B {percentLabel(0.06)} | O {percentLabel(0.07)}</p>
                  <p>House / Property / Other: C {percentLabel(0.03)} | B {percentLabel(0.04)} | O {percentLabel(0.05)}</p>
                  <p className="opacity-90">C = Conservative, B = Base, O = Optimistic</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {RETURN_PROFILE_OPTIONS.map((profile) => (
            <Button
              key={profile}
              type="button"
              size="sm"
              variant={returnProfile === profile ? 'default' : 'outline'}
              onClick={() => setReturnProfile(profile)}
              className="h-7 px-2 text-xs"
            >
              {profile}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-6">
          {/* Total Net Worth */}
          <div className="space-y-3 p-4 rounded-lg border border-l-[3px] border-l-indigo-500 bg-card">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/15">
                <Shield className="h-5 w-5 text-indigo-600" />
              </div>
              <h3 className="font-semibold text-sm uppercase tracking-wide">Total Assets</h3>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Years of Expenses Covered</p>
                <p className={cn(
                  'text-2xl font-bold tabular-nums',
                  metrics.yearsTotal >= 10 ? 'text-indigo-600' : metrics.yearsTotal >= 5 ? 'text-blue-600' : 'text-amber-600'
                )}>
                  {yearsLabel(metrics.yearsTotal)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {returnLabel(metrics.totalRealReturn)}
                </p>
              </div>
              <div className="space-y-1 pt-2 border-t">
                <p className="text-sm">
                  <span className="text-xs text-muted-foreground">Net Worth: </span>
                  <span className="font-semibold">{formatCompact(netWorth)}</span>
                </p>
                <p className="text-sm">
                  <span className="text-xs text-muted-foreground">Annual Net Outflow: </span>
                  <span className="font-semibold">{formatCompact(annualNetOutflow)}</span>
                </p>
                <p className="text-sm">
                  <span className="text-xs text-muted-foreground">Breakeven Annual Expenses: </span>
                  <span className="font-semibold">{formatCompact(metrics.totalBreakevenExpenses)}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Liquid Assets Only */}
          <div className="space-y-3 p-4 rounded-lg border border-l-[3px] border-l-blue-500 bg-card">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/15">
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
              <h3 className="font-semibold text-sm uppercase tracking-wide">Liquid Assets</h3>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Years from Liquid Assets Only</p>
                <p className={cn(
                  'text-2xl font-bold tabular-nums',
                  metrics.yearsLiquid >= 5 ? 'text-blue-600' : metrics.yearsLiquid >= 2 ? 'text-blue-600' : 'text-amber-600'
                )}>
                  {yearsLabel(metrics.yearsLiquid)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {returnLabel(metrics.liquidRealReturn)}
                </p>
              </div>
              <div className="space-y-1 pt-2 border-t">
                <p className="text-sm">
                  <span className="text-xs text-muted-foreground">Liquid Assets: </span>
                  <span className="font-semibold">{formatCompact(liquidAssets)}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Cash, Checking, Savings, and Brokerage accounts
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Income {formatCompact(annualIncome)} + Gift {formatCompact(annualGiftMoney)} vs Expenses {formatCompact(annualExpenses)}
                </p>
                <p className="text-sm">
                  <span className="text-xs text-muted-foreground">Breakeven Annual Expenses: </span>
                  <span className="font-semibold">{formatCompact(metrics.liquidBreakevenExpenses)}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground/70 mt-4 italic">
          Uses estimated annual Income, Gift Money, and Expenses from your app forecast. Assumes {returnProfile.toLowerCase()} returns by asset type and 3% annual inflation.
        </p>
      </CardContent>
    </Card>
  )
}
