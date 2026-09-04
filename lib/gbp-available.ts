import type { AccountBalance } from '@/lib/types'
import { isTrustAccount } from '@/lib/trust-exclusions'
import { isCashFlowRow } from '@/lib/category-filters'
import { todayLocalDateString } from '@/lib/date-utils'

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
 *
 * ## Rolling the balances forward
 *
 * `account_balances` is a snapshot typed into the accounts tab by hand, monthly
 * at best and sometimes a good deal less often. On its own it answers "what did
 * I have when I last looked", which is a different and much less useful question
 * than "what can I pay for today" — a month of school fees leaves the headline
 * figure untouched while the bank account empties.
 *
 * So sterling ledger rows dated after the snapshot are netted onto it. This is
 * the same identity `lib/reconciliation.ts` checks in the other direction —
 * closing balance = opening balance + ledger over the window — used here to
 * project the closing balance the bank has not been asked for yet.
 *
 * Two properties are worth stating because they bound how far to trust it:
 *
 * - **The ledger is not attributed to an account.** `transaction_log` has no
 *   account column, so the roll-forward can only be applied to the sterling
 *   pool as a whole. When contributing accounts carry different `date_updated`
 *   values, the baseline is the oldest of them (the date the aggregate is
 *   honestly current to), and flows already reflected in a fresher account are
 *   counted a second time. That errs downward on a pool that mostly spends,
 *   which is the safe direction for a "can I pay for this" figure.
 * - **It only knows what has been recorded.** A quiet ledger and a quiet month
 *   look identical, so `asOf` still reports a date rather than claiming "now".
 */

export type GbpAvailable = {
  /** Sterling cash on hand, in GBP: reported balances plus the ledger since. */
  total: number
  /** The reported balances alone, before the roll-forward. */
  balances: number
  /** Net sterling booked after `balancesAsOf`. Negative is a drawdown. */
  sinceBalances: number
  /** Ledger rows that fed `sinceBalances`. Zero means nothing was rolled forward. */
  rowsApplied: number
  /** Contributing accounts, largest first, at their reported balances. */
  accounts: { name: string; balance: number }[]
  /** Oldest `date_updated` among contributing accounts — the roll-forward baseline. */
  balancesAsOf: string | null
  /** Latest date the figure reflects: the last ledger row applied, else the baseline. */
  asOf: string | null
}

/** A `transaction_log` row, narrowed to what the roll-forward reads. */
export type GbpLedgerRow = {
  date?: string | null
  category?: string | null
  counterparty?: string | null
  amount_gbp?: number | null
  amount_usd?: number | null
  currency?: string | null
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

/**
 * The sterling cash effect of one ledger row, or `null` when the row cannot
 * move a GBP account.
 *
 * `currency` — the currency the transaction was actually denominated in — is the
 * discriminator, the same one `reconcileLedgerToBalances` scopes on. `amount_gbp`
 * is populated on dollar rows too, as the converted figure, so summing it blind
 * would drain sterling for dollars spent out of a dollar account.
 *
 * Rows predating the currency column carry no such marker. They are taken only
 * when sterling is the sole amount on the row, which is the shape the CSV
 * importer writes for a GBP file; a row carrying both amounts and no currency
 * cannot be told apart from a converted dollar row and is left out.
 */
function sterlingCashEffect(row: GbpLedgerRow): number | null {
  // Valuation marks and excluded rows describe value, not money moving.
  if (!isCashFlowRow(row)) return null

  const declared = row.currency?.toString().trim().toUpperCase()
  if (declared && declared !== 'GBP') return null
  if (!declared && row.amount_usd != null) return null

  const amount = Number(row.amount_gbp ?? Number.NaN)
  return Number.isFinite(amount) ? amount : null
}

export function computeGbpAvailable(
  accounts: AccountBalance[],
  ledger: GbpLedgerRow[] = [],
  options: { today?: string } = {},
): GbpAvailable {
  const contributing = latestAccountRows(accounts).filter(
    (account) =>
      account.category === 'Cash' &&
      account.currency === 'GBP' &&
      !isTrustAccount(account) &&
      Number(account.balance_total_local ?? 0) !== 0,
  )

  const balances = contributing.reduce(
    (sum, account) => sum + Number(account.balance_total_local ?? 0),
    0,
  )

  const balancesAsOf = contributing.reduce<string | null>((oldest, account) => {
    const date = account.date_updated?.slice(0, 10) ?? null
    if (!date) return oldest
    return !oldest || date < oldest ? date : oldest
  }, null)

  const today = options.today ?? todayLocalDateString()

  let sinceBalances = 0
  let rowsApplied = 0
  let lastApplied: string | null = null

  // With no baseline there is nothing to roll forward from: an unanchored sum of
  // the ledger is not a balance.
  if (balancesAsOf) {
    for (const row of ledger) {
      const date = String(row.date ?? '').slice(0, 10)
      // Strictly after the baseline — the snapshot is the close of that day, so
      // rows dated on it are already in the balance. Future-dated rows are
      // commitments, not cash that has left.
      if (!date || date <= balancesAsOf || date > today) continue

      const amount = sterlingCashEffect(row)
      if (amount === null) continue

      sinceBalances += amount
      rowsApplied += 1
      if (!lastApplied || date > lastApplied) lastApplied = date
    }
  }

  return {
    total: balances + sinceBalances,
    balances,
    sinceBalances,
    rowsApplied,
    accounts: contributing
      .map((account) => ({
        name: account.account_name,
        balance: Number(account.balance_total_local ?? 0),
      }))
      .sort((a, b) => b.balance - a.balance),
    balancesAsOf,
    asOf: lastApplied ?? balancesAsOf,
  }
}
