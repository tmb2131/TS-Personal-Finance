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

export function isTrustAccount(account: TrustExcludableAccount): boolean {
  const category = (account.category ?? '').trim().toLowerCase()
  if (!category) return false
  return category === 'trust' || category.includes('trust')
}

/** Drop trust-held accounts from a list before totalling spendable capital. */
export function excludeTrustAccounts<T extends TrustExcludableAccount>(accounts: T[]): T[] {
  return accounts.filter((account) => !isTrustAccount(account))
}
