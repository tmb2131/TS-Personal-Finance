/**
 * Ledger-to-balance reconciliation.
 *
 * The cash model is only as good as the assertion that the transactions explain
 * the balance change. Without that assertion a non-cash row entered into the
 * ledger inflates modelled cash indefinitely and nothing complains.
 *
 * Real case that motivated this: five rows tagged `Valuation change` — non-cash
 * marks entered as GBP cash inflows — put the sterling model £37,855 above the
 * bank over seven months. The USD side, which happened to have no such rows,
 * reconciled to $1,003 across the same window. The bug was invisible because
 * nothing ever compared the two.
 */

export interface LedgerEntry {
  /** ISO date, `YYYY-MM-DD`. */
  date: string
  /** Signed, in `currency`. Positive is an inflow. */
  amount: number
  currency: string
  category?: string | null
  counterparty?: string | null
}

export interface ReconciliationInput {
  currency: string
  /** Balance at the close of the day before `periodStart`. */
  openingBalance: number
  /** Balance at the close of `periodEnd`. */
  closingBalance: number
  /** ISO date, inclusive. */
  periodStart: string
  /** ISO date, inclusive. */
  periodEnd: string
  entries: LedgerEntry[]
  /**
   * Absolute tolerance in `currency`. Defaults to 0.5% of the movement, floored
   * at 250, which is roughly the noise from timing differences at month end.
   */
  tolerance?: number
  /** Counterparty substrings treated as non-cash. Case-insensitive. */
  nonCashPatterns?: string[]
}

export interface ReconciliationSuspect {
  entry: LedgerEntry
  reason: 'non_cash_pattern' | 'unpaired_large_transfer'
  /** How much of the discrepancy this entry would explain if removed. */
  explains: number
}

export interface ReconciliationResult {
  currency: string
  periodStart: string
  periodEnd: string
  /** Closing minus opening, from the balance records. */
  actualChange: number
  /** Sum of ledger entries in the window. */
  ledgerChange: number
  /** ledgerChange − actualChange. Positive means the ledger overstates cash. */
  discrepancy: number
  tolerance: number
  reconciled: boolean
  suspects: ReconciliationSuspect[]
  /** Discrepancy once every suspect is removed. */
  residualAfterSuspects: number
  summary: string
}

/**
 * Counterparties that describe a change in value rather than a movement of cash.
 * Extend rather than replace — each entry here is a bug that got through once.
 */
export const DEFAULT_NON_CASH_PATTERNS = [
  'valuation change',
  'valuation adjustment',
  'market value',
  'revaluation',
  'unrealised',
  'unrealized',
  'mark to market',
  'accrual',
]

const LARGE_TRANSFER_FRACTION = 0.1

function inWindow(date: string, start: string, end: string): boolean {
  return date >= start && date <= end
}

function isNonCash(entry: LedgerEntry, patterns: string[]): boolean {
  const haystack = `${entry.counterparty ?? ''} ${entry.category ?? ''}`.toLowerCase()
  return patterns.some((pattern) => haystack.includes(pattern))
}

export function reconcileLedgerToBalances(input: ReconciliationInput): ReconciliationResult {
  const {
    currency,
    openingBalance,
    closingBalance,
    periodStart,
    periodEnd,
    entries,
    nonCashPatterns = DEFAULT_NON_CASH_PATTERNS,
  } = input

  const scoped = entries.filter(
    (entry) => entry.currency === currency && inWindow(entry.date, periodStart, periodEnd)
  )

  const actualChange = closingBalance - openingBalance
  const ledgerChange = scoped.reduce((sum, entry) => sum + entry.amount, 0)
  const discrepancy = ledgerChange - actualChange

  const tolerance = input.tolerance ?? Math.max(250, Math.abs(actualChange) * 0.005)
  const reconciled = Math.abs(discrepancy) <= tolerance

  const suspects: ReconciliationSuspect[] = []

  if (!reconciled) {
    for (const entry of scoped) {
      if (isNonCash(entry, nonCashPatterns)) {
        suspects.push({ entry, reason: 'non_cash_pattern', explains: entry.amount })
      }
    }

    // An unpaired transfer larger than a tenth of the discrepancy is worth a look
    // even when it carries no telltale counterparty string.
    const threshold = Math.abs(discrepancy) * LARGE_TRANSFER_FRACTION
    for (const entry of scoped) {
      if (suspects.some((suspect) => suspect.entry === entry)) continue
      if (Math.abs(entry.amount) < threshold) continue
      if (Math.sign(entry.amount) !== Math.sign(discrepancy)) continue
      const hasOffset = scoped.some(
        (other) => other !== entry && Math.abs(other.amount + entry.amount) < 0.01
      )
      if (!hasOffset) {
        suspects.push({ entry, reason: 'unpaired_large_transfer', explains: entry.amount })
      }
    }
  }

  const explained = suspects
    .filter((suspect) => suspect.reason === 'non_cash_pattern')
    .reduce((sum, suspect) => sum + suspect.explains, 0)
  const residualAfterSuspects = discrepancy - explained

  const summary = reconciled
    ? `${currency} reconciles: ledger ${ledgerChange.toFixed(0)} vs balances ${actualChange.toFixed(0)}, within ${tolerance.toFixed(0)}.`
    : `${currency} does NOT reconcile: ledger ${ledgerChange.toFixed(0)} vs balances ${actualChange.toFixed(0)}, off by ${discrepancy.toFixed(0)} (tolerance ${tolerance.toFixed(0)}). ${suspects.length} suspect entr${suspects.length === 1 ? 'y' : 'ies'}; residual after non-cash rows ${residualAfterSuspects.toFixed(0)}.`

  return {
    currency,
    periodStart,
    periodEnd,
    actualChange,
    ledgerChange,
    discrepancy,
    tolerance,
    reconciled,
    suspects,
    residualAfterSuspects,
    summary,
  }
}

/**
 * Run the check per currency. Anything that fails should surface in the UI rather
 * than being logged — a silent reconciliation failure is the same as no check.
 */
export function reconcileAllCurrencies(
  inputs: ReconciliationInput[]
): { allReconciled: boolean; results: ReconciliationResult[] } {
  const results = inputs.map(reconcileLedgerToBalances)
  return { allReconciled: results.every((result) => result.reconciled), results }
}
