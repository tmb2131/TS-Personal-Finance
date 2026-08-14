/**
 * Trust capital exclusions.
 *
 * Two pools of money sit on the balance sheet but are not spendable:
 *
 *   - The Brosens 2012 Children's Trust line is a 25% interest in a larger
 *     trust and is preserve-and-pass-down capital.
 *   - The education trust is ring-fenced for Kiran's and Nilan's education and
 *     is tracked separately in `kids_accounts`, which no liquidity or runway
 *     figure reads.
 *
 * Neither belongs in runway, liquidity, or spendable-capital figures.
 *
 * The headline figures already excluded trust capital before this module
 * existed, but only incidentally: the trust account's category is `Trust` (so
 * it misses the Cash/Brokerage filter) and its liquidity profile is
 * `Locked Up` (so it misses the Instant filter). Recategorising the account
 * would have silently pulled £6.2m of untouchable capital into the numbers
 * most likely to be acted on. This module makes the exclusion explicit and
 * load-bearing, and gives every surface a consistent label to show for it.
 */

export type TrustExcludableAccount = {
  category?: string | null
}

/** Label to render wherever a figure has had trust capital removed. */
export const TRUST_EXCLUSION_LABEL = 'Excludes trust capital'

/** Longer form for tooltips and card footnotes. */
export const TRUST_EXCLUSION_NOTE =
  'Excludes the Brosens 2012 Children’s Trust and the education trust — preserve-and-pass-down capital that is not spendable.'

/**
 * Account categories that hold trust capital.
 *
 * Matched on the exact normalized name, never as a substring — the same rule
 * `category-filters.ts` applies to counterparties so that "Prestige Valuations"
 * survives. Substring matching here would silently drop a category such as
 * "Trustee Fees" out of every spendable figure, and the drop would be invisible
 * because the figure would simply be smaller.
 *
 * A genuinely new trust category has to be added here. That is the point: it
 * makes the exclusion a decision rather than an accident of spelling.
 */
const TRUST_CATEGORY_NAMES = ['trust', 'education trust'] as const

const TRUST_CATEGORY_SET = new Set<string>(TRUST_CATEGORY_NAMES)

export function isTrustAccount(account: TrustExcludableAccount): boolean {
  const category = (account.category ?? '').trim().toLowerCase()
  if (!category) return false
  return TRUST_CATEGORY_SET.has(category)
}

/** Drop trust-held accounts from a list before totalling spendable capital. */
export function excludeTrustAccounts<T extends TrustExcludableAccount>(accounts: T[]): T[] {
  return accounts.filter((account) => !isTrustAccount(account))
}
