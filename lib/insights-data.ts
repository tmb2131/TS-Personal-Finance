import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computeAnnualTrends,
  computeMonthlyTrends,
  computeAnnualForecasts,
  fetchFxRateGBPUSD,
  fetchForecastSettingsMap,
  fetchCategories,
  fetchTransactionsPaged,
} from '@/lib/forecasting'
import type {
  BudgetTarget,
  AnnualTrend,
  MonthlyTrend,
  HistoricalNetWorth,
  AccountBalance,
  RecurringPayment,
} from '@/lib/types'
import {
  rankAllocationObservations,
  rankSpendingObservations,
  type Observation,
} from '@/lib/observations'

export interface ForecastByCategoryItem {
  category: string
  forecast: number
  ytd: number
  annualBudget: number
}

/** Server-only: full payload for the Key Insights page (serializable for server → client). */
export interface InsightsDataPayload {
  budgetData: BudgetTarget[]
  annualTrends: AnnualTrend[]
  monthlyTrends: MonthlyTrend[]
  forecastByCategory: ForecastByCategoryItem[]
  historicalNetWorth: HistoricalNetWorth[]
  accountBalances: AccountBalance[]
  allocationObservations: Observation[]
  spendingObservations: Observation[]
  error: string | null
}

/**
 * Fetches and computes all data needed for the Key Insights page.
 * Use from server (page or API route); shares one preload + parallel computes.
 */
const HISTORICAL_NET_WORTH_YEARS_BACK = 25

export async function fetchInsightsData(
  supabase: SupabaseClient,
  userId: string
): Promise<InsightsDataPayload> {
  const currentYear = new Date().getFullYear()
  const txStartDate = `${currentYear - 4}-01-01`
  const minNetWorthDate = `${currentYear - HISTORICAL_NET_WORTH_YEARS_BACK}-01-01`

  const [
    budgetResult,
    netWorthResult,
    accountsResult,
    recurringResult,
    rate,
    settingsMap,
    categories,
    transactionRows,
  ] = await Promise.all([
    supabase.from('budget_targets').select('*'),
    supabase
      .from('historical_net_worth')
      .select('*')
      .gte('date', minNetWorthDate)
      .order('date', { ascending: false }),
    // De-duplication below keeps latest row per (institution, account_name); 500 rows is sufficient for typical account counts.
    supabase
      .from('account_balances')
      .select('*')
      .order('date_updated', { ascending: false })
      .limit(500),
    supabase.from('recurring_payments').select('*').eq('user_id', userId),
    fetchFxRateGBPUSD(supabase),
    fetchForecastSettingsMap(supabase, userId),
    fetchCategories(supabase, userId),
    fetchTransactionsPaged(supabase, userId, txStartDate),
  ])

  const preloaded = {
    rate,
    settingsMap,
    budgetRes: { data: budgetResult.data },
    categories,
    transactionRows,
  }

  const [annualTrends, monthlyTrends, forecastByCategory] = await Promise.all([
    computeAnnualTrends(supabase, userId, preloaded),
    computeMonthlyTrends(supabase, userId, preloaded),
    computeAnnualForecasts(supabase, userId, preloaded),
  ])

  const accountsData = accountsResult.data ?? []
  const accountsMap = new Map<string, (typeof accountsData)[number]>()
  for (const account of accountsData) {
    const row = account as { institution?: string; account_name?: string; date_updated?: string }
    const key = `${row.institution ?? ''}-${row.account_name ?? ''}`
    const existing = accountsMap.get(key)
    const accountDate = row.date_updated
    const existingDate = existing ? (existing as { date_updated?: string }).date_updated : null
    if (
      !existing ||
      (accountDate && (!existingDate || new Date(accountDate) > new Date(existingDate)))
    ) {
      accountsMap.set(key, account)
    }
  }
  const accountBalances = Array.from(accountsMap.values()) as AccountBalance[]

  const forecastByCategorySerialized: ForecastByCategoryItem[] = forecastByCategory
    ? Array.from(forecastByCategory.entries()).map(([category, value]) => ({
        category,
        forecast: value.forecast,
        ytd: value.ytd,
        annualBudget: value.annualBudget,
      }))
    : []

  const recurring = (recurringResult.data ?? []) as RecurringPayment[]
  const asOf = new Date().toISOString().slice(0, 10)
  const observationsInput = {
    accounts: accountBalances,
    recurring,
    annualTrends: annualTrends ?? [],
    monthlyTrends: monthlyTrends ?? [],
    forecastByCategory: forecastByCategorySerialized,
    gbpUsdRate: rate || 1.25,
    baseCurrency: 'GBP' as const,
    asOf,
  }
  const allocationObservations = rankAllocationObservations(observationsInput, 5)
  const spendingObservations = rankSpendingObservations(observationsInput, 5)

  return {
    budgetData: budgetResult.data ?? [],
    annualTrends: annualTrends ?? [],
    monthlyTrends: monthlyTrends ?? [],
    forecastByCategory: forecastByCategorySerialized,
    historicalNetWorth: netWorthResult.data ?? [],
    accountBalances,
    allocationObservations,
    spendingObservations,
    error: budgetResult.error || netWorthResult.error || accountsResult.error ? 'Partial failure' : null,
  }
}
