import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { computeAnnualForecasts } from '@/lib/forecasting'

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

type PfSnapshot = {
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

  const yearEnd = await fetchLatestPfSnapshotOnOrBefore(db, userId, today)
  if (!yearEnd) {
    // No historical net worth yet, so clear stale YoY rows.
    const { error: deleteError } = await db.from('yoy_net_worth').delete().eq('user_id', userId)
    if (deleteError) throw deleteError
    console.log(`[yoyNetWorth] No Personal/Family history for user ${userId}; cleared YoY rows`)
    return { year: null, asOfDate: null, rowsWritten: 0, skipped: true }
  }

  const targetYear = Number(yearEnd.date.slice(0, 4))
  const previousYearEndDate = `${targetYear - 1}-12-31`

  const yearStart =
    (await fetchLatestPfSnapshotOnOrBefore(db, userId, previousYearEndDate)) ?? yearEnd

  const forecasts = await computeAnnualForecasts(db, userId)
  const gbpUsdRate = await fetchCurrentGbpUsdRate(db)
  const yearEndRate = await fetchGbpUsdRateOnOrBefore(db, yearStart.date, gbpUsdRate)

  let incomeGbp = 0
  let giftMoneyGbp = 0
  let expensesGbp = 0

  for (const [rawCategory, values] of forecasts.entries()) {
    const category = rawCategory.trim()
    if (!category) continue

    const forecastGbp = toFiniteNumber(values.forecast) ?? 0

    if (category === 'Income') {
      incomeGbp += forecastGbp
      continue
    }

    if (category === 'Gift Money') {
      giftMoneyGbp += forecastGbp
      continue
    }

    if (!EXPENSE_EXCLUDED_CATEGORIES.has(category)) {
      expensesGbp += forecastGbp
    }
  }

  const incomeUsd = incomeGbp * gbpUsdRate
  const giftMoneyUsd = giftMoneyGbp * gbpUsdRate
  const expensesUsd = expensesGbp * gbpUsdRate

  const deltaGbp = yearEnd.amount_gbp - yearStart.amount_gbp
  const deltaUsd = yearEnd.amount_usd - yearStart.amount_usd

  // Base investment return before separating FX impact.
  // Signed math:
  // investment = delta - income - gift + expenses
  // with expense rows stored negative, this becomes subtracting the signed expense sum.
  const baseInvestmentReturnGbp = deltaGbp - incomeGbp - giftMoneyGbp - expensesGbp
  const baseInvestmentReturnUsd = deltaUsd - incomeUsd - giftMoneyUsd - expensesUsd

  // FX Impact:
  // - GBP view: prior-year USD-account value (in GBP) * % change in GBPUSD, signed inverse
  //   because stronger GBP lowers GBP value of USD holdings.
  // - USD view: prior-year GBP-account value (in USD) * % change in GBPUSD.
  const { usdAccountsUsd, gbpAccountsGbp } = await fetchPriorYearCurrencyExposure(db, userId, yearStart.date)
  const ratePctChange = yearEndRate > EPSILON ? (gbpUsdRate - yearEndRate) / yearEndRate : 0

  const priorYearUsdAccountsGbp = yearEndRate > EPSILON ? usdAccountsUsd / yearEndRate : 0
  const priorYearGbpAccountsUsd = gbpAccountsGbp * yearEndRate

  const fxImpactGbp = -priorYearUsdAccountsGbp * ratePctChange
  const fxImpactUsd = priorYearGbpAccountsUsd * ratePctChange

  // Investment return excludes explicit FX impact.
  const investmentReturnGbp = baseInvestmentReturnGbp - fxImpactGbp
  const investmentReturnUsd = baseInvestmentReturnUsd - fxImpactUsd

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
      amount_gbp: toMoney(incomeGbp),
      amount_usd: toMoney(incomeUsd),
    },
    {
      user_id: userId,
      category: 'Gift Money',
      amount_gbp: toMoney(giftMoneyGbp),
      amount_usd: toMoney(giftMoneyUsd),
    },
    {
      user_id: userId,
      category: 'Expenses',
      amount_gbp: toMoney(expensesGbp),
      amount_usd: toMoney(expensesUsd),
    },
    ...(
      Math.abs(fxImpactGbp) > EPSILON || Math.abs(fxImpactUsd) > EPSILON
        ? [{
            user_id: userId,
            category: 'FX Impact',
            amount_gbp: toMoney(fxImpactGbp),
            amount_usd: toMoney(fxImpactUsd),
          }]
        : []
    ),
    {
      user_id: userId,
      category: 'Investment Return YTD',
      amount_gbp: toMoney(investmentReturnGbp),
      amount_usd: toMoney(investmentReturnUsd),
    },
    {
      user_id: userId,
      category: 'Year End',
      amount_gbp: toMoney(yearEnd.amount_gbp),
      amount_usd: toMoney(yearEnd.amount_usd),
    },
  ]

  const { error: deleteError } = await db.from('yoy_net_worth').delete().eq('user_id', userId)
  if (deleteError) throw deleteError

  const { error: insertError } = await db.from('yoy_net_worth').insert(rows)
  if (insertError) throw insertError

  console.log(
    `[yoyNetWorth] Rebuilt YoY rows for user ${userId}: year=${targetYear}, asOf=${yearEnd.date}, rows=${rows.length}`
  )

  return {
    year: targetYear,
    asOfDate: yearEnd.date,
    rowsWritten: rows.length,
    skipped: false,
  }
}
