'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useCurrency } from '@/lib/contexts/currency-context'
import { useAccounts } from '@/lib/hooks/queries/use-accounts'
import { useDebt } from '@/lib/hooks/queries/use-debt'
import { useDailySummary } from '@/lib/hooks/queries/use-daily-summary'
import { useCashRunway } from '@/lib/hooks/queries/use-cash-runway'
import { useFinancialAssumptions } from '@/lib/hooks/queries/use-financial-assumptions'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/query-keys'
import {
  computeSustainableSpendRange,
  type SustainableSpendAssumptions,
  type SustainableSpendResult,
} from '@/lib/sustainable-spend'
import type { AssetMixEntry } from '@/lib/return-assumptions'
import { resolveReturnAssumptions } from '@/lib/return-assumptions'
import { totalCashGbp } from '@/lib/account-totals'
import type { AccountBalance, Debt, FinancialAssumptions } from '@/lib/types'

const EXCLUDED_EXPENSE_CATEGORIES = ['Income', 'Gift Money', 'Other Income', 'Excluded']

export const DEFAULT_FINANCIAL_ASSUMPTIONS: Omit<
  FinancialAssumptions,
  'id' | 'user_id' | 'created_at' | 'updated_at'
> = {
  return_profile: 'Conservative',
  inflation_rate: 0.03,
  floor_mode: 'savings_rate',
  target_savings_rate: 0.2,
  wealth_target_gbp: null,
  wealth_target_usd: null,
  wealth_target_terms: 'real',
  horizon_years: 20,
  emergency_fund_months: 6,
  include_trust: false,
  nominal_return_assumptions: null,
}

type RecurringPaymentRow = {
  annualized_amount_gbp: number | null
  annualized_amount_usd: number | null
}

function useRecurringPaymentRows() {
  return useQuery({
    queryKey: queryKeys.recurringPayments,
    queryFn: async (): Promise<RecurringPaymentRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('recurring_payments')
        .select('annualized_amount_gbp, annualized_amount_usd')
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
}

/** Monetary inputs to the sustainable spend computation, in the display currency. */
export interface SustainableSpendInputsData {
  netWorth: number
  assetMix: AssetMixEntry[]
  annualIncome: number
  annualGiftMoney: number
  annualForecastSpend: number
  committedAnnualSpend: number
  cashRunwayMonths: number | null
}

/**
 * Assembles the monetary inputs (net worth, asset mix, forecast flows, committed
 * recurring spend, cash runway) used by `computeSustainableSpendRange`.
 * Returns null data while loading or when there isn't enough data to compute.
 */
export function useSustainableSpendInputs(includeTrust: boolean): {
  data: SustainableSpendInputsData | null
  loading: boolean
} {
  const { currency, fxRate, convertAmount } = useCurrency()
  const { data: accountsRaw, isLoading: accountsLoading } = useAccounts()
  const { data: debtRaw, isLoading: debtLoading } = useDebt()
  const { data: dailySummaryData, isLoading: summaryLoading } = useDailySummary()
  const { data: burnRes, isLoading: burnLoading } = useCashRunway()
  const { data: recurringRows, isLoading: recurringLoading } = useRecurringPaymentRows()

  const loading =
    accountsLoading || debtLoading || summaryLoading || burnLoading || recurringLoading

  const data = useMemo((): SustainableSpendInputsData | null => {
    if (loading) return null
    const accounts = (accountsRaw ?? []) as AccountBalance[]
    if (accounts.length === 0) return null

    // Latest balance per institution + account
    const accountsMap = new Map<string, AccountBalance>()
    accounts.forEach((a) => {
      const key = `${a.institution}-${a.account_name}`
      const existing = accountsMap.get(key)
      if (!existing || new Date(a.date_updated) > new Date(existing.date_updated)) {
        accountsMap.set(key, a)
      }
    })
    const latest = Array.from(accountsMap.values())

    const includeAccount = (a: AccountBalance) =>
      includeTrust ? true : a.category !== 'Trust'

    const grossAssets = latest.reduce((sum, a) => {
      if (!includeAccount(a)) return sum
      return sum + convertAmount(a.balance_total_local, a.currency, fxRate)
    }, 0)

    const assetMix = latest
      .map((a) => ({
        category: a.category,
        balance: convertAmount(a.balance_total_local, a.currency, fxRate),
        include: includeAccount(a),
      }))
      .filter((a) => a.include && a.balance > 0)
      .map(({ category, balance }) => ({ category, balance }))

    // Net debt out of net worth (latest row per debt name)
    const debts = (debtRaw ?? []) as Debt[]
    const debtMap = new Map<string, Debt>()
    debts.forEach((d) => {
      const existing = debtMap.get(d.name)
      if (!existing || new Date(d.date_updated) > new Date(existing.date_updated)) {
        debtMap.set(d.name, d)
      }
    })
    const totalDebt = Array.from(debtMap.values()).reduce((sum, d) => {
      const amount =
        currency === 'USD'
          ? d.amount_usd != null
            ? d.amount_usd
            : (d.amount_gbp ?? 0) * fxRate
          : d.amount_gbp != null
            ? d.amount_gbp
            : (d.amount_usd ?? 0) / (fxRate || 1)
      return sum + Math.max(0, amount)
    }, 0)

    const netWorth = grossAssets - totalDebt

    // Annual income / gifts / expenses from forecast (GBP in the daily summary payload)
    let incomeGBP = 0
    let giftMoneyGBP = 0
    let expensesGBP = 0
    const forecastRows = Array.isArray(dailySummaryData?.forecastByCategory)
      ? (dailySummaryData.forecastByCategory as { category: string; forecast: number }[])
      : []
    if (forecastRows.length === 0) return null
    for (const row of forecastRows) {
      const forecastGBP = Number(row?.forecast ?? 0)
      if (!Number.isFinite(forecastGBP)) continue
      if (row.category === 'Income') {
        incomeGBP += Math.abs(forecastGBP)
        continue
      }
      if (row.category === 'Gift Money') {
        giftMoneyGBP += Math.abs(forecastGBP)
        continue
      }
      if (EXCLUDED_EXPENSE_CATEGORIES.includes(row.category)) continue
      expensesGBP += Math.abs(forecastGBP)
    }

    const toDisplay = (valueGBP: number) =>
      currency === 'USD' ? convertAmount(valueGBP, 'GBP', fxRate) : valueGBP

    const annualIncome = toDisplay(incomeGBP)
    const annualGiftMoney = toDisplay(giftMoneyGBP)
    const annualForecastSpend = toDisplay(expensesGBP)

    if (annualIncome + annualGiftMoney <= 0 && netWorth <= 0) return null

    // Committed recurring spend (annualized)
    const committedAnnualSpend = (recurringRows ?? []).reduce((sum, p) => {
      const amount =
        currency === 'USD'
          ? p.annualized_amount_usd != null
            ? p.annualized_amount_usd
            : (p.annualized_amount_gbp ?? 0) * fxRate
          : p.annualized_amount_gbp != null
            ? p.annualized_amount_gbp
            : (p.annualized_amount_usd ?? 0) / (fxRate || 1)
      return sum + Math.max(0, amount)
    }, 0)

    // Cash runway in months. Both sides are GBP and the ratio is unitless, so
    // this no longer changes when the header currency toggle changes — the old
    // version converted cash and burn into the display currency separately and
    // round-tripped one of them through 1/fxRate.
    let cashRunwayMonths: number | null = null
    if (burnRes) {
      const monthlyBurnGbp = Number(burnRes.monthlyBurnGbp ?? 0)
      const totalCashGbpValue = totalCashGbp(latest, fxRate, 'spendable')
      cashRunwayMonths =
        monthlyBurnGbp > 0
          ? totalCashGbpValue / monthlyBurnGbp
          : totalCashGbpValue > 0
            ? Infinity
            : 0
    }

    return {
      netWorth,
      assetMix,
      annualIncome,
      annualGiftMoney,
      annualForecastSpend,
      committedAnnualSpend,
      cashRunwayMonths,
    }
  }, [
    loading,
    accountsRaw,
    debtRaw,
    dailySummaryData,
    burnRes,
    recurringRows,
    includeTrust,
    currency,
    fxRate,
    convertAmount,
  ])

  return { data, loading }
}

/** Resolves the stored wealth target (or null) into the current display currency. */
export function resolveWealthTarget(
  resolved: Pick<FinancialAssumptions, 'wealth_target_gbp' | 'wealth_target_usd'>,
  currency: string,
  fxRate: number
): number | null {
  return currency === 'USD'
    ? resolved.wealth_target_usd != null
      ? resolved.wealth_target_usd
      : resolved.wealth_target_gbp != null
        ? resolved.wealth_target_gbp * fxRate
        : null
    : resolved.wealth_target_gbp != null
      ? resolved.wealth_target_gbp
      : resolved.wealth_target_usd != null
        ? resolved.wealth_target_usd / (fxRate || 1)
        : null
}

export interface SustainableSpendData extends SustainableSpendResult {
  netWorth: number
  annualIncome: number
  annualGiftMoney: number
  committedAnnualSpend: number
  cashRunwayMonths: number | null
  /** Resolved assumptions used for the computation (stored row or defaults). */
  assumptions: SustainableSpendAssumptions
  /** False when the user has never saved assumptions and defaults are in use. */
  hasCustomAssumptions: boolean
}

export function useSustainableSpend(): { data: SustainableSpendData | null; loading: boolean } {
  const { currency, fxRate } = useCurrency()
  const { data: storedAssumptions, isLoading: assumptionsLoading } = useFinancialAssumptions()

  const raw = storedAssumptions ?? null
  const resolved = useMemo(
    () => ({ ...DEFAULT_FINANCIAL_ASSUMPTIONS, ...(raw ?? {}) }),
    [raw]
  )

  const { data: inputs, loading: inputsLoading } = useSustainableSpendInputs(
    resolved.include_trust
  )

  const loading = inputsLoading || assumptionsLoading

  const data = useMemo((): SustainableSpendData | null => {
    if (loading || !inputs) return null

    const wealthTarget = resolveWealthTarget(resolved, currency, fxRate)

    const assumptions: SustainableSpendAssumptions = {
      returnProfile: resolved.return_profile,
      returnAssumptions: resolveReturnAssumptions(
        resolved.return_profile,
        resolved.nominal_return_assumptions
      ),
      inflationRate: Number(resolved.inflation_rate),
      floorMode: resolved.floor_mode,
      targetSavingsRate: Number(resolved.target_savings_rate),
      wealthTarget,
      wealthTargetTerms: resolved.wealth_target_terms ?? 'real',
      horizonYears: Number(resolved.horizon_years),
      emergencyFundMonths: Number(resolved.emergency_fund_months),
    }

    const result = computeSustainableSpendRange({
      netWorth: inputs.netWorth,
      assetMix: inputs.assetMix,
      annualIncome: inputs.annualIncome,
      annualGiftMoney: inputs.annualGiftMoney,
      annualForecastSpend: inputs.annualForecastSpend,
      committedAnnualSpend: inputs.committedAnnualSpend,
      cashRunwayMonths: inputs.cashRunwayMonths,
      assumptions,
    })

    return {
      ...result,
      netWorth: inputs.netWorth,
      annualIncome: inputs.annualIncome,
      annualGiftMoney: inputs.annualGiftMoney,
      committedAnnualSpend: inputs.committedAnnualSpend,
      cashRunwayMonths: inputs.cashRunwayMonths,
      assumptions,
      hasCustomAssumptions: raw != null,
    }
  }, [loading, inputs, resolved, raw, currency, fxRate])

  return { data, loading }
}
