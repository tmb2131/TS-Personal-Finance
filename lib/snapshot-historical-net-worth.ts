import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

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

type HistoricalNetWorthInsert = {
  user_id: string
  date: string
  category: 'Personal' | 'Family' | 'Trust'
  amount_usd: number
  amount_gbp: number
  data_source: 'app_generated'
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

/**
 * Rebuild historical_net_worth from account_balances history.
 *
 * Snapshot model:
 * - Personal: sum of personal balances on non-Trust accounts
 * - Family: sum of family balances on non-Trust accounts
 * - Trust: total balances on Trust accounts
 *
 * For each date D, every account uses its latest known row with date_updated <= D.
 */
export async function rebuildHistoricalNetWorthFromAccountHistory(
  supabase?: SupabaseClient,
  userId?: string
): Promise<{ datesProcessed: number; rowsWritten: number; skipped: boolean }> {
  if (!userId) {
    console.error('rebuildHistoricalNetWorthFromAccountHistory: userId is required')
    return { datesProcessed: 0, rowsWritten: 0, skipped: true }
  }

  const db = supabase ?? (await createClient())

  const accountHistory = await fetchAccountHistory(db, userId)
  if (!accountHistory.length) {
    console.log(`[historicalNetWorth] No account history found for user ${userId}; skipping rebuild`)
    return { datesProcessed: 0, rowsWritten: 0, skipped: true }
  }

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

  const fallbackRates: Rates = {
    gbpUsd: currentGbp && currentGbp > 0
      ? currentGbp
      : latestHistoricalGbp && latestHistoricalGbp > 0
        ? latestHistoricalGbp
        : DEFAULT_GBPUSD_RATE,
    eurUsd: latestHistoricalEur && latestHistoricalEur > 0 ? latestHistoricalEur : DEFAULT_EURUSD_RATE,
  }

  const updatesByDate = new Map<string, AccountHistoryRow[]>()
  for (const row of accountHistory) {
    const dateKey = normalizeDateKey(row.date_updated)
    if (!dateKey) continue
    const existing = updatesByDate.get(dateKey) ?? []
    existing.push(row)
    updatesByDate.set(dateKey, existing)
  }

  const snapshotDates = Array.from(updatesByDate.keys()).sort((a, b) => a.localeCompare(b))
  if (!snapshotDates.length) {
    console.log(`[historicalNetWorth] No valid snapshot dates for user ${userId}; skipping rebuild`)
    return { datesProcessed: 0, rowsWritten: 0, skipped: true }
  }

  const { data: manualRows, error: manualRowsError } = await db
    .from('historical_net_worth')
    .select('date, category')
    .eq('user_id', userId)
    .eq('data_source', 'manual')
  if (manualRowsError) throw manualRowsError

  const manualKeys = new Set<string>(
    (manualRows || [])
      .map((row: { date: string; category: string }) => {
        const date = normalizeDateKey(row.date)
        const category = (row.category || '').trim()
        return date && category ? `${date}|${category}` : null
      })
      .filter((value): value is string => !!value)
  )

  const stateByAccount = new Map<string, AccountHistoryRow>()
  const snapshotRows: HistoricalNetWorthInsert[] = []

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
        // Legacy rows without entity split are treated as personal.
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
      const key = `${date}|Personal`
      if (!manualKeys.has(key)) {
        snapshotRows.push({
          user_id: userId,
          date,
          category: 'Personal',
          amount_usd: roundMoney(personalUsd),
          amount_gbp: roundMoney(personalGbp),
          data_source: 'app_generated',
        })
      }
    }
    if (Math.abs(familyUsd) > EPSILON || Math.abs(familyGbp) > EPSILON) {
      const key = `${date}|Family`
      if (!manualKeys.has(key)) {
        snapshotRows.push({
          user_id: userId,
          date,
          category: 'Family',
          amount_usd: roundMoney(familyUsd),
          amount_gbp: roundMoney(familyGbp),
          data_source: 'app_generated',
        })
      }
    }
    if (Math.abs(trustUsd) > EPSILON || Math.abs(trustGbp) > EPSILON) {
      const key = `${date}|Trust`
      if (!manualKeys.has(key)) {
        snapshotRows.push({
          user_id: userId,
          date,
          category: 'Trust',
          amount_usd: roundMoney(trustUsd),
          amount_gbp: roundMoney(trustGbp),
          data_source: 'app_generated',
        })
      }
    }
  }

  // Replace generated history with deterministic snapshots from account history.
  // Manual rows are preserved.
  const { error: deleteError } = await db
    .from('historical_net_worth')
    .delete()
    .eq('user_id', userId)
    .eq('data_source', 'app_generated')
  if (deleteError) throw deleteError

  if (snapshotRows.length > 0) {
    for (let i = 0; i < snapshotRows.length; i += PAGE_SIZE) {
      const chunk = snapshotRows.slice(i, i + PAGE_SIZE)
      const { error: insertError } = await db.from('historical_net_worth').insert(chunk)
      if (insertError) throw insertError
    }
  }

  console.log(
    `[historicalNetWorth] Rebuilt history for user ${userId}: ${snapshotDates.length} dates, ${snapshotRows.length} rows`
  )
  return { datesProcessed: snapshotDates.length, rowsWritten: snapshotRows.length, skipped: false }
}
