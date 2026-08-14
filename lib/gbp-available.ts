import type { AccountBalance } from '@/lib/types'
import { isTrustAccount } from '@/lib/trust-exclusions'

/**
 * Sterling cash actually held, as opposed to the total converted into sterling.
 *
 * The currency toggle restates every figure in the display currency. That is
 * the right behaviour for net worth, and the wrong behaviour for the number
 * that answers "can I pay for this". Roughly 95% of the working pool is
 * USD-denominated, so a converted total reads as sterling that is not there:
 * moving it takes an FX transfer and several days.
 *
 * This sums only GBP-denominated cash accounts and does not respond to the
 * currency toggle. The converted total is shown separately and labelled.
 */

export type GbpAvailable = {
  /** Sterling cash on hand, in GBP. */
  total: number
  /** Contributing accounts, largest first. */
  accounts: { name: string; balance: number }[]
  /** Oldest `date_updated` among contributing accounts — the figure is only as fresh as this. */
  asOf: string | null
}

/** Latest row per account, since `account_balances` keeps history. */
export function latestAccountRows(accounts: AccountBalance[]): AccountBalance[] {
  const byAccount = new Map<string, AccountBalance>()
  for (const account of accounts) {
    const key = `${account.institution}-${account.account_name}`
    const existing = byAccount.get(key)
    if (!existing || new Date(account.date_updated) > new Date(existing.date_updated)) {
      byAccount.set(key, account)
    }
  }
  return Array.from(byAccount.values())
}

export function computeGbpAvailable(accounts: AccountBalance[]): GbpAvailable {
  const contributing = latestAccountRows(accounts).filter(
    (account) =>
      account.category === 'Cash' &&
      account.currency === 'GBP' &&
      !isTrustAccount(account) &&
      Number(account.balance_total_local ?? 0) !== 0,
  )

  const total = contributing.reduce(
    (sum, account) => sum + Number(account.balance_total_local ?? 0),
    0,
  )

  const asOf = contributing.reduce<string | null>((oldest, account) => {
    const date = account.date_updated?.slice(0, 10) ?? null
    if (!date) return oldest
    return !oldest || date < oldest ? date : oldest
  }, null)

  return {
    total,
    accounts: contributing
      .map((account) => ({
        name: account.account_name,
        balance: Number(account.balance_total_local ?? 0),
      }))
      .sort((a, b) => b.balance - a.balance),
    asOf,
  }
}
