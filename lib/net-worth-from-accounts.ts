import type { SupabaseClient } from '@supabase/supabase-js'
import type { HistoricalNetWorth } from '@/lib/types'

const PAGE_SIZE = 1000
const DEFAULT_GBPUSD_RATE = 1.25
const DEFAULT_EURUSD_RATE = 1.08
const EPSILON = 0.0001

type AccountHistoryRow = {
  institution: string
  account_name: string
  category: string
  currency: string
  balance_total_local: number | null
  balance_personal_local: number | null
  balance_family_local: number | null
  date_updated: string
}

type FxHistoryRow = {
  date: string
  gbpusd_rate: number | null
  eurusd_rate: number | null
}

type Rates = { gbpUsd: number; eurUsd: number }

export type YearStartYearEndSnapshot = {
  yearStart: { date: string; amount_usd: number; amount_gbp: number }
  yearEnd: { date: string; amount_usd: number; amount_gbp: number }
}

function normalizeDateKey(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (trimmed.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10)
  }
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function toFiniteNumber(value: unknown): number | null {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function normalizeCurrency(value: string | null | undefined): 'GBP' | 'USD' | 'EUR' {
  const ccy = (value ?? '').toUpperCase()
  if (ccy === 'GBP' || ccy === 'USD' || ccy === 'EUR') return ccy
  return 'USD'
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function convertLocalToUsd(amountLocal: number, currency: 'GBP' | 'USD' | 'EUR', rates: Rates): number {
  if (currency === 'USD') return amountLocal
  if (currency === 'GBP') return amountLocal * rates.gbpUsd
  return amountLocal * rates.eurUsd
}

function convertLocalToGbp(amountLocal: number, currency: 'GBP' | 'USD' | 'EUR', rates: Rates): number {
  if (currency === 'GBP') return amountLocal
  const usd = convertLocalToUsd(amountLocal, currency, rates)
  return rates.gbpUsd > 0 ? usd / rates.gbpUsd : usd
}

async function fetchAccountHistory(db: SupabaseClient, userId: string): Promise<AccountHistoryRow[]> {
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

async function fetchFxHistory(db: SupabaseClient): Promise<FxHistoryRow[]> {
  const rows: FxHistoryRow[] = []
  let page = 0

  while (true) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, error } = await db
      .from('fx_rates')
      .select('date, gbpusd_rate, eurusd_rate')
      .order('date', { ascending: true })
      .range(from, to)

    if (error) throw error
    if (!data || data.length === 0) break

    rows.push(...(data as FxHistoryRow[]))
    if (data.length < PAGE_SIZE) break
    page += 1
  }

  return rows
}

async function getFallbackRates(db: SupabaseClient): Promise<Rates> {
  const fxHistoryRaw = await fetchFxHistory(db)
  const { data: currentFx, error: currentFxError } = await db
    .from('fx_rate_current')
    .select('gbpusd_rate')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (currentFxError) throw currentFxError

  const normalizedFx = fxHistoryRaw
    .map((row) => ({
      date: normalizeDateKey(row.date),
      gbpUsd: toFiniteNumber(row.gbpusd_rate),
      eurUsd: toFiniteNumber(row.eurusd_rate),
    }))
    .filter((row): row is { date: string; gbpUsd: number | null; eurUsd: number | null } => !!row.date)
    .sort((a, b) => a.date.localeCompare(b.date))

  const latestHistoricalGbp = [...normalizedFx].reverse().find((row) => row.gbpUsd != null && row.gbpUsd > 0)?.gbpUsd
  const latestHistoricalEur = [...normalizedFx].reverse().find((row) => row.eurUsd != null && row.eurUsd > 0)?.eurUsd
  const currentGbp = toFiniteNumber(currentFx?.gbpusd_rate)

  return {
    gbpUsd:
      currentGbp && currentGbp > 0
        ? currentGbp
        : latestHistoricalGbp && latestHistoricalGbp > 0
          ? latestHistoricalGbp
          : DEFAULT_GBPUSD_RATE,
    eurUsd: latestHistoricalEur && latestHistoricalEur > 0 ? latestHistoricalEur : DEFAULT_EURUSD_RATE,
  }
}

async function getRatesOnOrBefore(
  db: SupabaseClient,
  date: string,
  fallback: Rates
): Promise<Rates> {
  const { data, error } = await db
    .from('fx_rates')
    .select('gbpusd_rate, eurusd_rate')
    .lte('date', date)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return fallback

  const gbpUsd = toFiniteNumber(data.gbpusd_rate)
  const eurUsd = toFiniteNumber(data.eurusd_rate)
  return {
    gbpUsd: gbpUsd != null && gbpUsd > 0 ? gbpUsd : fallback.gbpUsd,
    eurUsd: eurUsd != null && eurUsd > 0 ? eurUsd : fallback.eurUsd,
  }
}

/**
 * Compute net worth time series from account_balances (same snapshot/rollback + FX logic as
 * snapshot-historical-net-worth). Returns in-memory HistoricalNetWorth[]; does not write to DB.
 */
export async function computeNetWorthTimeSeriesFromAccountBalances(
  db: SupabaseClient,
  userId: string
): Promise<HistoricalNetWorth[]> {
  const accountHistory = await fetchAccountHistory(db, userId)
  if (!accountHistory.length) return []

  const fxHistoryRaw = await fetchFxHistory(db)
  const fallbackRates = await getFallbackRates(db)

  const normalizedFx = fxHistoryRaw
    .map((row) => ({
      date: normalizeDateKey(row.date),
      gbpUsd: toFiniteNumber(row.gbpusd_rate),
      eurUsd: toFiniteNumber(row.eurusd_rate),
    }))
    .filter((row): row is { date: string; gbpUsd: number | null; eurUsd: number | null } => !!row.date)
    .sort((a, b) => a.date.localeCompare(b.date))

  const updatesByDate = new Map<string, AccountHistoryRow[]>()
  for (const row of accountHistory) {
    const dateKey = normalizeDateKey(row.date_updated)
    if (!dateKey) continue
    const existing = updatesByDate.get(dateKey) ?? []
    existing.push(row)
    updatesByDate.set(dateKey, existing)
  }

  const snapshotDates = Array.from(updatesByDate.keys()).sort((a, b) => a.localeCompare(b))
  if (!snapshotDates.length) return []

  const stateByAccount = new Map<string, AccountHistoryRow>()
  const result: HistoricalNetWorth[] = []
  let fxIndex = 0
  let activeRates: Rates = { ...fallbackRates }

  for (const date of snapshotDates) {
    while (fxIndex < normalizedFx.length && normalizedFx[fxIndex].date <= date) {
      const row = normalizedFx[fxIndex]
      if (row.gbpUsd != null && row.gbpUsd > 0) activeRates.gbpUsd = row.gbpUsd
      if (row.eurUsd != null && row.eurUsd > 0) activeRates.eurUsd = row.eurUsd
      fxIndex += 1
    }

    const updates = (updatesByDate.get(date) ?? []).sort((a, b) => a.date_updated.localeCompare(b.date_updated))
    for (const update of updates) {
      const key = `${update.institution}|${update.account_name}`
      stateByAccount.set(key, update)
    }

    let personalUsd = 0
    let personalGbp = 0
    let familyUsd = 0
    let familyGbp = 0
    let trustUsd = 0
    let trustGbp = 0

    for (const account of stateByAccount.values()) {
      const currency = normalizeCurrency(account.currency)
      const category = (account.category ?? '').trim().toLowerCase()
      const isTrust = category === 'trust' || category.includes('trust')
      const total = toFiniteNumber(account.balance_total_local) ?? 0
      const personal = toFiniteNumber(account.balance_personal_local) ?? 0
      const family = toFiniteNumber(account.balance_family_local) ?? 0

      if (isTrust) {
        if (Math.abs(total) > EPSILON) {
          trustUsd += convertLocalToUsd(total, currency, activeRates)
          trustGbp += convertLocalToGbp(total, currency, activeRates)
        }
        continue
      }

      const splitMissing = Math.abs(personal) <= EPSILON && Math.abs(family) <= EPSILON && Math.abs(total) > EPSILON
      if (splitMissing) {
        personalUsd += convertLocalToUsd(total, currency, activeRates)
        personalGbp += convertLocalToGbp(total, currency, activeRates)
        continue
      }

      if (Math.abs(personal) > EPSILON) {
        personalUsd += convertLocalToUsd(personal, currency, activeRates)
        personalGbp += convertLocalToGbp(personal, currency, activeRates)
      }
      if (Math.abs(family) > EPSILON) {
        familyUsd += convertLocalToUsd(family, currency, activeRates)
        familyGbp += convertLocalToGbp(family, currency, activeRates)
      }
    }

    if (Math.abs(personalUsd) > EPSILON || Math.abs(personalGbp) > EPSILON) {
      result.push({
        id: `${date}-Personal`,
        date,
        category: 'Personal',
        amount_usd: roundMoney(personalUsd),
        amount_gbp: roundMoney(personalGbp),
      })
    }
    if (Math.abs(familyUsd) > EPSILON || Math.abs(familyGbp) > EPSILON) {
      result.push({
        id: `${date}-Family`,
        date,
        category: 'Family',
        amount_usd: roundMoney(familyUsd),
        amount_gbp: roundMoney(familyGbp),
      })
    }
    if (Math.abs(trustUsd) > EPSILON || Math.abs(trustGbp) > EPSILON) {
      result.push({
        id: `${date}-Trust`,
        date,
        category: 'Trust',
        amount_usd: roundMoney(trustUsd),
        amount_gbp: roundMoney(trustGbp),
      })
    }
  }

  return result
}

/**
 * Compute Personal+Family net worth as of a single date from account_balances (latest row per
 * account with date_updated <= cutoffDate), with FX conversion.
 */
async function computePfSnapshotAsOf(
  db: SupabaseClient,
  userId: string,
  cutoffDate: string,
  rates: Rates
): Promise<{ date: string; amount_usd: number; amount_gbp: number } | null> {
  const history = await fetchAccountHistoryUpTo(db, userId, cutoffDate)
  if (history.length === 0) return null

  const stateByAccount = new Map<string, AccountHistoryRow>()
  for (const row of history) {
    const key = `${row.institution}|${row.account_name}`
    stateByAccount.set(key, row)
  }

  // Latest snapshot date is the max date_updated among all rows we have (all <= cutoffDate).
  let snapshotDate: string | null = null
  for (const row of stateByAccount.values()) {
    const d = normalizeDateKey(row.date_updated)
    if (d && (!snapshotDate || d > snapshotDate)) snapshotDate = d
  }
  if (!snapshotDate) return null

  let amountUsd = 0
  let amountGbp = 0

  for (const account of stateByAccount.values()) {
    const category = (account.category ?? '').trim().toLowerCase()
    const isTrust = category === 'trust' || category.includes('trust')
    if (isTrust) continue

    const currency = normalizeCurrency(account.currency)
    const total = toFiniteNumber(account.balance_total_local) ?? 0
    const personal = toFiniteNumber(account.balance_personal_local) ?? 0
    const family = toFiniteNumber(account.balance_family_local) ?? 0

    const splitMissing = Math.abs(personal) <= EPSILON && Math.abs(family) <= EPSILON && Math.abs(total) > EPSILON
    const personalPlusFamily = splitMissing ? total : personal + family

    amountUsd += convertLocalToUsd(personalPlusFamily, currency, rates)
    amountGbp += convertLocalToGbp(personalPlusFamily, currency, rates)
  }

  return {
    date: snapshotDate,
    amount_usd: roundMoney(amountUsd),
    amount_gbp: roundMoney(amountGbp),
  }
}

/**
 * Compute Year Start (prior year-end) and Year End (current) net worth from account_balances.
 * Uses Personal+Family only to match YoY semantics.
 */
export async function computeYearStartYearEndFromAccountBalances(
  db: SupabaseClient,
  userId: string
): Promise<YearStartYearEndSnapshot | null> {
  const today = new Date().toISOString().slice(0, 10)
  const fallbackRates = await getFallbackRates(db)

  const yearEnd = await computePfSnapshotAsOf(db, userId, today, fallbackRates)
  if (!yearEnd) return null

  const targetYear = Number(yearEnd.date.slice(0, 4))
  const previousYearEndDate = `${targetYear - 1}-12-31`
  const yearEndRates = await getRatesOnOrBefore(db, yearEnd.date, fallbackRates)
  const yearStartRates = await getRatesOnOrBefore(db, previousYearEndDate, fallbackRates)

  const yearStart = await computePfSnapshotAsOf(db, userId, previousYearEndDate, yearStartRates)

  return {
    yearStart: yearStart ?? yearEnd,
    yearEnd,
  }
}
