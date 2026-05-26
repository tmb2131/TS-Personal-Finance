import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { computeAnnualForecasts, type AnnualForecastEntry } from '@/lib/forecasting'
import { recordYoYBridgeMeta } from '@/lib/sync-metadata'
import type { YoYBridgeMeta } from '@/lib/types'

const EPSILON = 0.0001
const DEFAULT_GBPUSD_RATE = 1.25
const PAGE_SIZE = 1000

const EXPENSE_EXCLUDED_CATEGORIES = new Set(['Income', 'Gift Money', 'Other Income', 'Excluded'])

type HistoricalPfRow = {
  date: string
  category: string
  amount_gbp: number | null
  amount_usd: number | null
}

export type PfSnapshot = {
  date: string
  amount_gbp: number
  amount_usd: number
}

type AccountHistoryRow = {
  institution: string
  account_name: string
  category: string
  currency: string | null
  balance_total_local: number | null
  balance_personal_local: number | null
  balance_family_local: number | null
  date_updated: string
}

export type YoYFlowTotals = {
  incomeGbp: number
  giftMoneyGbp: number
  expensesGbp: number
  incomeYtdGbp: number
  giftMoneyYtdGbp: number
  expensesYtdGbp: number
}

export type YoYFxImpact = {
  fxImpactGbp: number
  fxImpactUsd: number
}

export type YoYForecastBridgeResult = {
  incomeGbp: number
  incomeUsd: number
  giftMoneyGbp: number
  giftMoneyUsd: number
  expensesGbp: number
  expensesUsd: number
  fxImpactGbp: number
  fxImpactUsd: number
  investmentReturnGbp: number
  investmentReturnUsd: number
  yearEndForecastGbp: number
  yearEndForecastUsd: number
  meta: YoYBridgeMeta
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function toFiniteNumber(value: unknown): number | null {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function toMoney(value: number): number {
  const rounded = Math.round(value * 100) / 100
  return Math.abs(rounded) <= EPSILON ? 0 : rounded
}

function normalizeCurrency(value: string | null | undefined): 'USD' | 'GBP' | 'EUR' {
  const ccy = (value ?? '').trim().toUpperCase()
  if (ccy === 'USD' || ccy === 'GBP' || ccy === 'EUR') return ccy
  return 'USD'
}

export function aggregateYoYFlows(forecasts: Map<string, AnnualForecastEntry>): YoYFlowTotals {
  let incomeGbp = 0
  let giftMoneyGbp = 0
  let expensesGbp = 0
  let incomeYtdGbp = 0
  let giftMoneyYtdGbp = 0
  let expensesYtdGbp = 0

  for (const [rawCategory, values] of forecasts.entries()) {
    const category = rawCategory.trim()
    if (!category) continue

    const forecastGbp = toFiniteNumber(values.forecast) ?? 0
    const ytdGbp = toFiniteNumber(values.ytd) ?? 0

    if (category === 'Income') {
      incomeGbp += forecastGbp
      incomeYtdGbp += ytdGbp
      continue
    }

    if (category === 'Gift Money') {
      giftMoneyGbp += forecastGbp
      giftMoneyYtdGbp += ytdGbp
      continue
    }

    if (!EXPENSE_EXCLUDED_CATEGORIES.has(category)) {
      expensesGbp += forecastGbp
      expensesYtdGbp += ytdGbp
    }
  }

  return {
    incomeGbp,
    giftMoneyGbp,
    expensesGbp,
    incomeYtdGbp,
    giftMoneyYtdGbp,
    expensesYtdGbp,
  }
}

export function computeYoYForecastBridge(input: {
  yearStart: PfSnapshot
  latestActual: PfSnapshot
  flows: YoYFlowTotals
  fx: YoYFxImpact
  gbpUsdRate: number
}): YoYForecastBridgeResult {
  const { yearStart, latestActual, flows, fx, gbpUsdRate } = input
  const forecastYear = Number(latestActual.date.slice(0, 4))

  const incomeUsd = flows.incomeGbp * gbpUsdRate
  const giftMoneyUsd = flows.giftMoneyGbp * gbpUsdRate
  const expensesUsd = flows.expensesGbp * gbpUsdRate

  const incomeYtdUsd = flows.incomeYtdGbp * gbpUsdRate
  const giftMoneyYtdUsd = flows.giftMoneyYtdGbp * gbpUsdRate
  const expensesYtdUsd = flows.expensesYtdGbp * gbpUsdRate

  const investmentReturnGbp =
    latestActual.amount_gbp -
    yearStart.amount_gbp -
    flows.incomeYtdGbp -
    flows.giftMoneyYtdGbp -
    flows.expensesYtdGbp -
    fx.fxImpactGbp

  const investmentReturnUsd =
    latestActual.amount_usd -
    yearStart.amount_usd -
    incomeYtdUsd -
    giftMoneyYtdUsd -
    expensesYtdUsd -
    fx.fxImpactUsd

  const yearEndForecastGbp =
    yearStart.amount_gbp +
    flows.incomeGbp +
    flows.giftMoneyGbp +
    flows.expensesGbp +
    fx.fxImpactGbp +
    investmentReturnGbp

  const yearEndForecastUsd =
    yearStart.amount_usd +
    incomeUsd +
    giftMoneyUsd +
    expensesUsd +
    fx.fxImpactUsd +
    investmentReturnUsd

  return {
    incomeGbp: flows.incomeGbp,
    incomeUsd,
    giftMoneyGbp: flows.giftMoneyGbp,
    giftMoneyUsd,
    expensesGbp: flows.expensesGbp,
    expensesUsd,
    fxImpactGbp: fx.fxImpactGbp,
    fxImpactUsd: fx.fxImpactUsd,
    investmentReturnGbp,
    investmentReturnUsd,
    yearEndForecastGbp,
    yearEndForecastUsd,
    meta: {
      forecast_year: forecastYear,
      year_start_date: yearStart.date,
      actual_as_of_date: latestActual.date,
      forecast_year_end_date: `${forecastYear}-12-31`,
    },
  }
}

async function fetchLatestPfSnapshotOnOrBefore(
  db: SupabaseClient,
  userId: string,
  cutoffDate: string
): Promise<PfSnapshot | null> {
  const { data, error } = await db
    .from('historical_net_worth')
    .select('date, category, amount_gbp, amount_usd')
    .eq('user_id', userId)
    .in('category', ['Personal', 'Family'])
    .lte('date', cutoffDate)
    .order('date', { ascending: false })
    .limit(20)

  if (error) throw error
  if (!data || data.length === 0) return null

  const rows = data as HistoricalPfRow[]
  const snapshotDate = normalizeDate(rows[0]?.date)
  if (!snapshotDate) return null

  let amountGbp = 0
  let amountUsd = 0

  for (const row of rows) {
    if (normalizeDate(row.date) !== snapshotDate) continue
    amountGbp += toFiniteNumber(row.amount_gbp) ?? 0
    amountUsd += toFiniteNumber(row.amount_usd) ?? 0
  }

  return {
    date: snapshotDate,
    amount_gbp: toMoney(amountGbp),
    amount_usd: toMoney(amountUsd),
  }
}

async function fetchCurrentGbpUsdRate(db: SupabaseClient): Promise<number> {
  const { data, error } = await db
    .from('fx_rate_current')
    .select('gbpusd_rate')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error

  const rate = toFiniteNumber(data?.gbpusd_rate)
  if (rate != null && rate > 0) return rate
  return DEFAULT_GBPUSD_RATE
}

async function fetchGbpUsdRateOnOrBefore(db: SupabaseClient, cutoffDate: string, fallbackRate: number): Promise<number> {
  const { data, error } = await db
    .from('fx_rates')
    .select('gbpusd_rate')
    .lte('date', cutoffDate)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error

  const rate = toFiniteNumber(data?.gbpusd_rate)
  if (rate != null && rate > 0) return rate
  return fallbackRate > 0 ? fallbackRate : DEFAULT_GBPUSD_RATE
}

async function fetchAccountHistoryUpTo(
  db: SupabaseClient,
  userId: string,
  cutoffDate: string
): Promise<AccountHistoryRow[]> {
  const rows: AccountHistoryRow[] = []
  let page = 0

  while (true) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, error } = await db
      .from('account_balances')
      .select(
        'institution, account_name, category, currency, balance_total_local, balance_personal_local, balance_family_local, date_updated'
      )
      .eq('user_id', userId)
      .lte('date_updated', cutoffDate)
      .order('date_updated', { ascending: true })
      .range(from, to)

    if (error) throw error
    if (!data || data.length === 0) break

    rows.push(...(data as AccountHistoryRow[]))
    if (data.length < PAGE_SIZE) break
    page += 1
  }

  return rows
}

async function fetchPriorYearCurrencyExposure(
  db: SupabaseClient,
  userId: string,
  asOfDate: string
): Promise<{ usdAccountsUsd: number; gbpAccountsGbp: number }> {
  const history = await fetchAccountHistoryUpTo(db, userId, asOfDate)
  if (history.length === 0) {
    return { usdAccountsUsd: 0, gbpAccountsGbp: 0 }
  }

  // Build latest known row per account at/under the cutoff date.
  const stateByAccount = new Map<string, AccountHistoryRow>()
  for (const row of history) {
    const key = `${row.institution}|${row.account_name}`
    stateByAccount.set(key, row)
  }

  let usdAccountsUsd = 0
  let gbpAccountsGbp = 0

  for (const account of stateByAccount.values()) {
    const category = (account.category ?? '').trim().toLowerCase()
    const isTrust = category === 'trust' || category.includes('trust')
    if (isTrust) continue

    const currency = normalizeCurrency(account.currency)
    const total = toFiniteNumber(account.balance_total_local) ?? 0
    const personal = toFiniteNumber(account.balance_personal_local) ?? 0
    const family = toFiniteNumber(account.balance_family_local) ?? 0

    // Mirror historical snapshot logic: when splits are absent, treat total as personal.
    const splitMissing = Math.abs(personal) <= EPSILON && Math.abs(family) <= EPSILON && Math.abs(total) > EPSILON
    const personalPlusFamily = splitMissing ? total : personal + family

    if (currency === 'USD') usdAccountsUsd += personalPlusFamily
    if (currency === 'GBP') gbpAccountsGbp += personalPlusFamily
  }

  return { usdAccountsUsd, gbpAccountsGbp }
}

export async function rebuildYoYNetWorthFromAppData(
  supabase?: SupabaseClient,
  userId?: string
): Promise<{ year: number | null; asOfDate: string | null; rowsWritten: number; skipped: boolean }> {
  if (!userId) {
    console.error('rebuildYoYNetWorthFromAppData: userId is required')
    return { year: null, asOfDate: null, rowsWritten: 0, skipped: true }
  }

  const db = supabase ?? (await createClient())
  const today = new Date().toISOString().slice(0, 10)

  const latestActual = await fetchLatestPfSnapshotOnOrBefore(db, userId, today)
  if (!latestActual) {
    // No historical net worth yet, so clear stale YoY rows.
    const { error: deleteError } = await db.from('yoy_net_worth').delete().eq('user_id', userId)
    if (deleteError) throw deleteError
    console.log(`[yoyNetWorth] No Personal/Family history for user ${userId}; cleared YoY rows`)
    return { year: null, asOfDate: null, rowsWritten: 0, skipped: true }
  }

  const targetYear = Number(latestActual.date.slice(0, 4))
  const previousYearEndDate = `${targetYear - 1}-12-31`

  const yearStart =
    (await fetchLatestPfSnapshotOnOrBefore(db, userId, previousYearEndDate)) ?? latestActual

  const forecasts = await computeAnnualForecasts(db, userId)
  const gbpUsdRate = await fetchCurrentGbpUsdRate(db)
  const yearStartRate = await fetchGbpUsdRateOnOrBefore(db, yearStart.date, gbpUsdRate)

  const flows = aggregateYoYFlows(forecasts)

  // FX Impact:
  // - GBP view: prior-year USD-account value (in GBP) * % change in GBPUSD, signed inverse
  //   because stronger GBP lowers GBP value of USD holdings.
  // - USD view: prior-year GBP-account value (in USD) * % change in GBPUSD.
  const { usdAccountsUsd, gbpAccountsGbp } = await fetchPriorYearCurrencyExposure(db, userId, yearStart.date)
  const ratePctChange = yearStartRate > EPSILON ? (gbpUsdRate - yearStartRate) / yearStartRate : 0

  const priorYearUsdAccountsGbp = yearStartRate > EPSILON ? usdAccountsUsd / yearStartRate : 0
  const priorYearGbpAccountsUsd = gbpAccountsGbp * yearStartRate

  const fx: YoYFxImpact = {
    fxImpactGbp: -priorYearUsdAccountsGbp * ratePctChange,
    fxImpactUsd: priorYearGbpAccountsUsd * ratePctChange,
  }

  const bridge = computeYoYForecastBridge({
    yearStart,
    latestActual,
    flows,
    fx,
    gbpUsdRate,
  })

  const rows = [
    {
      user_id: userId,
      category: 'Year Start',
      amount_gbp: toMoney(yearStart.amount_gbp),
      amount_usd: toMoney(yearStart.amount_usd),
    },
    {
      user_id: userId,
      category: 'Income',
      amount_gbp: toMoney(bridge.incomeGbp),
      amount_usd: toMoney(bridge.incomeUsd),
    },
    {
      user_id: userId,
      category: 'Gift Money',
      amount_gbp: toMoney(bridge.giftMoneyGbp),
      amount_usd: toMoney(bridge.giftMoneyUsd),
    },
    {
      user_id: userId,
      category: 'Expenses',
      amount_gbp: toMoney(bridge.expensesGbp),
      amount_usd: toMoney(bridge.expensesUsd),
    },
    ...(
      Math.abs(bridge.fxImpactGbp) > EPSILON || Math.abs(bridge.fxImpactUsd) > EPSILON
        ? [{
            user_id: userId,
            category: 'FX Impact',
            amount_gbp: toMoney(bridge.fxImpactGbp),
            amount_usd: toMoney(bridge.fxImpactUsd),
          }]
        : []
    ),
    {
      user_id: userId,
      category: 'Investment Return YTD',
      amount_gbp: toMoney(bridge.investmentReturnGbp),
      amount_usd: toMoney(bridge.investmentReturnUsd),
    },
    {
      user_id: userId,
      category: 'Year End',
      amount_gbp: toMoney(bridge.yearEndForecastGbp),
      amount_usd: toMoney(bridge.yearEndForecastUsd),
    },
  ]

  const { error: deleteError } = await db.from('yoy_net_worth').delete().eq('user_id', userId)
  if (deleteError) throw deleteError

  const { error: insertError } = await db.from('yoy_net_worth').insert(rows)
  if (insertError) throw insertError

  await recordYoYBridgeMeta(db, userId, bridge.meta)

  console.log(
    `[yoyNetWorth] Rebuilt YoY forecast bridge for user ${userId}: year=${targetYear}, asOf=${latestActual.date}, forecastEnd=${bridge.meta.forecast_year_end_date}, rows=${rows.length}`
  )

  return {
    year: targetYear,
    asOfDate: latestActual.date,
    rowsWritten: rows.length,
    skipped: false,
  }
}
