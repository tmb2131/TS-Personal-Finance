import { createClient } from '@/lib/supabase/server'
import {
  computeAnnualTrends,
  computeMonthlyTrends,
  computeAnnualForecasts,
  fetchFxRateGBPUSD,
  fetchForecastSettingsMap,
  fetchCategories,
  fetchTransactionsPaged,
} from '@/lib/forecasting'
import { NextResponse } from 'next/server'

/**
 * GET /api/insights
 * Returns all data needed for the Key Insights page in one response.
 * Uses shared preloaded data and parallel server-side computes for fast load.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentYear = new Date().getFullYear()
    const txStartDate = `${currentYear - 4}-01-01`

    const [
      budgetResult,
      netWorthResult,
      accountsResult,
      rate,
      settingsMap,
      categories,
      transactionRows,
    ] = await Promise.all([
      supabase.from('budget_targets').select('*'),
      supabase
        .from('historical_net_worth')
        .select('*')
        .order('date', { ascending: false }),
      supabase
        .from('account_balances')
        .select('*')
        .order('date_updated', { ascending: false }),
      fetchFxRateGBPUSD(supabase),
      fetchForecastSettingsMap(supabase, user.id),
      fetchCategories(supabase, user.id),
      fetchTransactionsPaged(supabase, user.id, txStartDate),
    ])

    const preloaded = {
      rate,
      settingsMap,
      budgetRes: { data: budgetResult.data },
      categories,
      transactionRows,
    }

    const [annualTrends, monthlyTrends, forecastByCategory] = await Promise.all([
      computeAnnualTrends(supabase, user.id, preloaded),
      computeMonthlyTrends(supabase, user.id, preloaded),
      computeAnnualForecasts(supabase, user.id, preloaded),
    ])

    // Most recent balance per institution+account_name (same logic as KeyInsights client)
    const accountsData = accountsResult.data ?? []
    const accountsMap = new Map<
      string,
      (typeof accountsData)[number]
    >()
    for (const account of accountsData) {
      const key = `${(account as { institution?: string }).institution ?? ''}-${(account as { account_name?: string }).account_name ?? ''}`
      const existing = accountsMap.get(key)
      const accountDate = (account as { date_updated?: string }).date_updated
      const existingDate = existing
        ? (existing as { date_updated?: string }).date_updated
        : null
      if (
        !existing ||
        (accountDate && (!existingDate || new Date(accountDate) > new Date(existingDate)))
      ) {
        accountsMap.set(key, account)
      }
    }
    const accountBalances = Array.from(accountsMap.values())

    const forecastByCategorySerialized = forecastByCategory
      ? Array.from(forecastByCategory.entries()).map(([category, value]) => ({
          category,
          forecast: value.forecast,
          ytd: value.ytd,
          annualBudget: value.annualBudget,
        }))
      : []

    const body = {
      budgetData: budgetResult.data ?? [],
      annualTrends: annualTrends ?? [],
      monthlyTrends: monthlyTrends ?? [],
      forecastByCategory: forecastByCategorySerialized,
      historicalNetWorth: netWorthResult.data ?? [],
      accountBalances,
      error: budgetResult.error || netWorthResult.error || accountsResult.error ? 'Partial failure' : null,
    }

    return NextResponse.json(body)
  } catch (error) {
    console.error('insights API error', error)
    const message =
      error instanceof Error ? error.message : 'Failed to load insights'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
