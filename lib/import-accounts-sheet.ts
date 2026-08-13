import { google } from 'googleapis'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Import account balances from the master workbook's `Accounts` tab.
 *
 * Migration 036 removed account balances from the main sheet sync and made them
 * app-managed, which is why they went stale: the balances are still maintained
 * in the master workbook, but nothing read them any more. The derived "Data
 * Tables" workbook that `syncGoogleSheet` reads has no Account Balances tab at
 * all, so this reads the master directly.
 *
 * Layout of the Accounts tab (header on row 4, data from row 5):
 *   I Institution   K Account Name   M Account Category   Q Currency
 *   R Personal      S Family         T Total Local CCY    X Last Updated
 */

export const ACCOUNTS_SHEET_TAB = 'Accounts'
export const ACCOUNTS_SHEET_RANGE = 'I4:X400'

/** Column offsets within the range above, which starts at column I. */
const COL = {
  institution: 0, // I
  accountName: 2, // K
  category: 4, // M
  currency: 8, // Q
  personal: 9, // R
  family: 10, // S
  total: 11, // T
  lastUpdated: 15, // X
} as const

const VALID_CURRENCIES = new Set(['USD', 'GBP', 'EUR'])

export interface ParsedAccountRow {
  institution: string
  account_name: string
  category: string
  currency: 'USD' | 'GBP' | 'EUR'
  balance_personal_local: number
  balance_family_local: number
  balance_total_local: number
  date_updated: string
}

export interface SkippedAccountRow {
  account_name: string
  reason: string
}

/** Sheets serial (days since 1899-12-30) or a parseable date string. */
export function parseSheetDate(value: unknown): string | null {
  if (value == null || value === '') return null
  const raw = String(value).trim()
  if (!raw || raw.toUpperCase() === 'NA' || raw === '-') return null

  const n = Number(raw)
  if (Number.isFinite(n) && raw !== '') {
    // A bare number in this column is a Sheets serial, not a year.
    if (n < 1 || n > 100000) return null
    const epoch = Date.UTC(1899, 11, 30)
    const d = new Date(epoch + n * 86400000)
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
  }

  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** Strips currency symbols, thousands separators and parenthesised negatives. */
export function parseNumber(value: unknown): number {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  let raw = String(value).trim()
  if (!raw) return 0
  const negative = /^\(.*\)$/.test(raw)
  raw = raw.replace(/[()]/g, '').replace(/[^0-9.\-]/g, '')
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  return negative ? -n : n
}

export function parseAccountRows(rows: any[][]): {
  parsed: ParsedAccountRow[]
  skipped: SkippedAccountRow[]
} {
  const parsed: ParsedAccountRow[] = []
  const skipped: SkippedAccountRow[] = []

  // Row 0 of the range is the header.
  for (const row of rows.slice(1)) {
    const institution = String(row[COL.institution] ?? '').trim()
    const accountName = String(row[COL.accountName] ?? '').trim()
    if (!institution || !accountName) continue

    const currency = String(row[COL.currency] ?? '').trim().toUpperCase()
    if (!VALID_CURRENCIES.has(currency)) {
      skipped.push({ account_name: accountName, reason: `unsupported currency "${currency || 'blank'}"` })
      continue
    }

    const dateUpdated = parseSheetDate(row[COL.lastUpdated])
    if (!dateUpdated) {
      // Credit cards carry "NA" here. They are liabilities tracked elsewhere.
      skipped.push({ account_name: accountName, reason: 'no Last Updated date' })
      continue
    }

    const total = parseNumber(row[COL.total])
    const personal = parseNumber(row[COL.personal])
    const family = parseNumber(row[COL.family])

    parsed.push({
      institution,
      account_name: accountName,
      category: String(row[COL.category] ?? '').trim() || 'Other',
      currency: currency as 'USD' | 'GBP' | 'EUR',
      balance_personal_local: personal,
      // Trust the total; derive family as the residual so the two always tie.
      balance_family_local: Math.abs(personal + family - total) < 0.01 ? family : total - personal,
      balance_total_local: total,
      date_updated: dateUpdated,
    })
  }

  return { parsed, skipped }
}

export interface ImportAccountsOptions {
  spreadsheetId: string
  userId: string
  /** Parse and report without writing. */
  dryRun?: boolean
}

export interface ImportAccountsResult {
  success: boolean
  error?: string
  dryRun: boolean
  rowsParsed: number
  rowsWritten: number
  skipped: SkippedAccountRow[]
  latestDate: string | null
  /** Accounts whose newest imported balance differs from what was already stored. */
  changed: { account_name: string; from: number | null; to: number; date: string }[]
}

export async function importAccountsFromSheet(
  db: SupabaseClient,
  options: ImportAccountsOptions
): Promise<ImportAccountsResult> {
  const { spreadsheetId, userId, dryRun = false } = options
  const empty = { dryRun, rowsParsed: 0, rowsWritten: 0, skipped: [], latestDate: null, changed: [] }

  try {
    if (!spreadsheetId) throw new Error('spreadsheetId is required')
    if (!userId) throw new Error('userId is required')
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
      throw new Error('Google service account credentials are not configured')
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
    const sheets = google.sheets({ version: 'v4', auth })

    const response = await sheets.spreadsheets.values
      .get({ spreadsheetId, range: `${ACCOUNTS_SHEET_TAB}!${ACCOUNTS_SHEET_RANGE}` })
      .catch((err: any) => {
        throw new Error(`Could not read the Accounts tab: ${err.message}`)
      })

    const rows = response.data.values ?? []
    if (rows.length < 2) {
      return { success: false, error: 'The Accounts tab returned no data rows.', ...empty }
    }

    const { parsed, skipped } = parseAccountRows(rows)
    if (parsed.length === 0) {
      return { success: false, error: 'No importable account rows were found.', ...empty, skipped }
    }

    const latestDate = parsed.reduce<string | null>(
      (max, row) => (max == null || row.date_updated > max ? row.date_updated : max),
      null
    )

    // Compare against the newest stored balance per account so the caller can
    // show what actually moved rather than just a row count.
    const { data: existing } = await db
      .from('account_balances')
      .select('institution, account_name, balance_total_local, date_updated, liquidity_profile, risk_profile, horizon_profile')
      .eq('user_id', userId)
      .order('date_updated', { ascending: false })

    const newestByAccount = new Map<string, any>()
    for (const row of existing ?? []) {
      const key = `${row.institution}|${row.account_name}`
      if (!newestByAccount.has(key)) newestByAccount.set(key, row)
    }

    const newestParsedByAccount = new Map<string, ParsedAccountRow>()
    for (const row of parsed) {
      const key = `${row.institution}|${row.account_name}`
      const seen = newestParsedByAccount.get(key)
      if (!seen || row.date_updated > seen.date_updated) newestParsedByAccount.set(key, row)
    }

    const changed: ImportAccountsResult['changed'] = []
    for (const [key, row] of newestParsedByAccount) {
      const prior = newestByAccount.get(key)
      const before = prior ? Number(prior.balance_total_local) : null
      if (before == null || Math.abs(before - row.balance_total_local) >= 0.01) {
        changed.push({
          account_name: row.account_name,
          from: before,
          to: row.balance_total_local,
          date: row.date_updated,
        })
      }
    }

    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        rowsParsed: parsed.length,
        rowsWritten: 0,
        skipped,
        latestDate,
        changed,
      }
    }

    // The liquidity / risk / horizon profiles are app-managed and are not in the
    // sheet. Carry them forward from the newest stored row so an import never
    // silently erases them.
    const payload = parsed.map((row) => {
      const prior = newestByAccount.get(`${row.institution}|${row.account_name}`)
      return {
        ...row,
        user_id: userId,
        liquidity_profile: prior?.liquidity_profile ?? null,
        risk_profile: prior?.risk_profile ?? null,
        horizon_profile: prior?.horizon_profile ?? null,
        data_source: 'google_sheet' as const,
      }
    })

    const { error } = await db
      .from('account_balances')
      .upsert(payload, { onConflict: 'user_id,institution,account_name,date_updated' })

    if (error) {
      return { success: false, error: error.message, ...empty, skipped, latestDate, changed }
    }

    return {
      success: true,
      dryRun: false,
      rowsParsed: parsed.length,
      rowsWritten: payload.length,
      skipped,
      latestDate,
      changed,
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to import accounts', ...empty }
  }
}
