import { excludeTrustAccounts } from '@/lib/trust-exclusions'

/**
 * One place that turns a list of account rows into a total.
 *
 * Before this module three surfaces answered "what are total assets?" with
 * three different numbers — Position's net worth card, Position's Account
 * Category Summary, and the Trends observations panel — because each had its
 * own dedupe, its own category spellings, its own FX conversion and its own
 * view on whether trust capital counts. The gap between the two
 * trust-inclusive totals was an FX artefact: `fetchFxRateGBPUSD` read
 * `fx_rate_current` without an ORDER BY on what is really a daily history
 * table, so the server picked an arbitrary day while the browser picked the
 * latest.
 *
 * Everything here is deliberately pure and GBP-denominated. Display currency
 * is a formatting concern and is applied by the caller, never inside a total.
 */

export type AccountTotalsRow = {
  institution?: string | null
  account_name?: string | null
  category?: string | null
  currency?: string | null
  balance_total_local?: number | null
  date_updated?: string | null
}

/**
 * Whether trust capital is in the figure.
 *
 * `spendable` is what every headline figure wants. `all` exists for the
 * balance-sheet views that deliberately show the whole picture, and it must be
 * labelled as such wherever it appears.
 */
export type AssetBasis = 'all' | 'spendable'

/**
 * Liquid means realisable now, at a known price, without asking anyone.
 *
 * Cash and Brokerage only. Retirement and Alt Inv were previously in the
 * observations copy of this set, which overstated liquid assets by roughly
 * £128k and made Trends disagree with Position about the same word. A broader
 * "realisable within 12 months" bucket is a legitimate thing to want, but it
 * needs its own name and its own row.
 */
export const LIQUID_CATEGORIES: ReadonlySet<string> = new Set(['Cash', 'Brokerage'])

/** Cash-like categories: the numerator of sterling runway. */
export const CASH_CATEGORIES: ReadonlySet<string> = new Set(['Cash', 'Checking', 'Savings'])

/** Canonical category order for balance-sheet tables. */
export const ACCOUNT_CATEGORIES = [
  'Cash',
  'Brokerage',
  'Alt Inv',
  'Retirement',
  'Taconic',
  'House',
  'Trust',
] as const

/**
 * The sheet writes `Alternative Investment` where the rest of the app says
 * `Alt Inv`. Position normalized this and observations did not, so the same
 * account was inside one total and outside another.
 */
export function normalizeAccountCategory(category: string | null | undefined): string {
  const trimmed = (category ?? '').trim()
  if (!trimmed) return ''

  const lower = trimmed.toLowerCase()
  if (lower.startsWith('alt') || lower.includes('alternative')) return 'Alt Inv'

  for (const known of ACCOUNT_CATEGORIES) {
    if (known.toLowerCase() === lower) return known
  }

  return trimmed
}

/**
 * Latest row per (institution, account_name).
 *
 * `account_balances` is append-only history, so every total has to dedupe
 * first. Rows with no `date_updated` lose to rows that have one rather than
 * being dropped, which is what the two previous copies of this disagreed on.
 */
export function latestAccountsByKey<T extends AccountTotalsRow>(accounts: T[]): T[] {
  const byKey = new Map<string, T>()
  for (const account of accounts) {
    const key = `${account.institution ?? ''}-${account.account_name ?? ''}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, account)
      continue
    }
    const incoming = account.date_updated ? new Date(account.date_updated).getTime() : null
    const current = existing.date_updated ? new Date(existing.date_updated).getTime() : null
    if (incoming != null && (current == null || incoming > current)) {
      byKey.set(key, account)
    }
  }
  return Array.from(byKey.values())
}

/**
 * Local balance to GBP. `gbpUsdRate` is GBP→USD, so USD divides.
 *
 * EUR has no rate of its own anywhere in the app; the 1.08 EUR→USD cross is
 * carried over from the previous observations implementation rather than
 * silently treating euros as sterling.
 */
export function toGbp(
  amountLocal: number,
  currency: string | null | undefined,
  gbpUsdRate: number
): number {
  const amount = Number(amountLocal ?? 0)
  if (!Number.isFinite(amount)) return 0

  const code = (currency ?? '').trim().toUpperCase()
  if (code === 'GBP' || code === '') return amount
  if (code === 'USD') return gbpUsdRate > 0 ? amount / gbpUsdRate : amount
  if (code === 'EUR') {
    const usd = amount * 1.08
    return gbpUsdRate > 0 ? usd / gbpUsdRate : usd
  }
  return amount
}

/** Deduped, category-normalized rows on the requested basis. Every total starts here. */
export function accountsOnBasis<T extends AccountTotalsRow>(
  accounts: T[],
  basis: AssetBasis
): (T & { category: string })[] {
  const normalized = latestAccountsByKey(accounts).map((account) => ({
    ...account,
    category: normalizeAccountCategory(account.category),
  }))
  return basis === 'spendable' ? excludeTrustAccounts(normalized) : normalized
}

/**
 * The one function that produces total assets. Both bases derive from it, so
 * no two surfaces can drift apart without this returning two different numbers
 * for the same input.
 */
export function totalAssetsGbp(
  accounts: AccountTotalsRow[],
  gbpUsdRate: number,
  basis: AssetBasis
): number {
  return accountsOnBasis(accounts, basis).reduce(
    (sum, account) => sum + toGbp(account.balance_total_local ?? 0, account.currency, gbpUsdRate),
    0
  )
}

/** Total assets broken down by normalized category. Sums exactly to `totalAssetsGbp`. */
export function assetsByCategoryGbp(
  accounts: AccountTotalsRow[],
  gbpUsdRate: number,
  basis: AssetBasis
): Map<string, number> {
  const byCategory = new Map<string, number>()
  for (const account of accountsOnBasis(accounts, basis)) {
    const gbp = toGbp(account.balance_total_local ?? 0, account.currency, gbpUsdRate)
    byCategory.set(account.category, (byCategory.get(account.category) ?? 0) + gbp)
  }
  return byCategory
}

/**
 * Every category present in the data, canonical ones first in balance-sheet
 * order and anything unrecognised appended.
 *
 * Position previously iterated a hard-coded list, so an account in a category
 * nobody had thought of vanished from the summary table while still counting
 * towards net worth — the table and its own grand total could disagree.
 */
export function presentCategories(accounts: AccountTotalsRow[], basis: AssetBasis): string[] {
  const present = new Set(accountsOnBasis(accounts, basis).map((account) => account.category))
  const known = ACCOUNT_CATEGORIES.filter((category) => present.has(category))
  const extra = Array.from(present)
    .filter((category) => category && !known.includes(category as (typeof ACCOUNT_CATEGORIES)[number]))
    .sort()
  return [...known, ...extra]
}

/** Liquid assets: `LIQUID_CATEGORIES` only, on the requested basis. */
export function liquidAssetsGbp(
  accounts: AccountTotalsRow[],
  gbpUsdRate: number,
  basis: AssetBasis
): number {
  return accountsOnBasis(accounts, basis)
    .filter((account) => LIQUID_CATEGORIES.has(account.category))
    .reduce(
      (sum, account) => sum + toGbp(account.balance_total_local ?? 0, account.currency, gbpUsdRate),
      0
    )
}

/** Illiquid assets. Defined as the complement of liquid so the two always sum to the total. */
export function illiquidAssetsGbp(
  accounts: AccountTotalsRow[],
  gbpUsdRate: number,
  basis: AssetBasis
): number {
  return accountsOnBasis(accounts, basis)
    .filter((account) => !LIQUID_CATEGORIES.has(account.category))
    .reduce(
      (sum, account) => sum + toGbp(account.balance_total_local ?? 0, account.currency, gbpUsdRate),
      0
    )
}

/** Cash held in one currency, in that currency's own units. Numerator of sterling runway. */
export function cashInCurrency(
  accounts: AccountTotalsRow[],
  currency: 'GBP' | 'USD',
  basis: AssetBasis
): number {
  return accountsOnBasis(accounts, basis)
    .filter((account) => CASH_CATEGORIES.has(account.category))
    .filter((account) => (account.currency ?? '').trim().toUpperCase() === currency)
    .reduce((sum, account) => sum + Number(account.balance_total_local ?? 0), 0)
}

/** All cash, converted to GBP. Numerator of the converted-runway framing. */
export function totalCashGbp(
  accounts: AccountTotalsRow[],
  gbpUsdRate: number,
  basis: AssetBasis
): number {
  return accountsOnBasis(accounts, basis)
    .filter((account) => CASH_CATEGORIES.has(account.category))
    .reduce(
      (sum, account) => sum + toGbp(account.balance_total_local ?? 0, account.currency, gbpUsdRate),
      0
    )
}
