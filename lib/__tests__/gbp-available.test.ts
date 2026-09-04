import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeGbpAvailable, type GbpLedgerRow } from '../gbp-available.ts'
import type { AccountBalance } from '../types.ts'

/**
 * GBP available answers "can I pay for this", and it used to answer it off a
 * balance snapshot typed into the accounts tab once a month. Between snapshots
 * the figure sat still while the bank account emptied, so the number was at its
 * least reliable exactly when the question was most likely to be asked.
 *
 * The roll-forward nets sterling ledger rows booked after the snapshot onto it.
 * The traps these fixtures guard are all about what does *not* count: dollar
 * rows carry a converted `amount_gbp` and would drain sterling for dollars spent
 * out of a dollar account; valuation marks are the rows that already put the
 * sterling model £37,855 above the bank once (see `reconciliation.test.ts`).
 */

const SNAPSHOT = '2026-08-13'
const TODAY = '2026-09-04'

const ACCOUNTS = [
  {
    institution: 'Barclays',
    account_name: 'Current',
    category: 'Cash',
    currency: 'GBP',
    balance_total_local: 169_263,
    date_updated: `${SNAPSHOT}T00:00:00+00:00`,
  },
  // Stale duplicate of the row above: dedupe must keep the later one.
  {
    institution: 'Barclays',
    account_name: 'Current',
    category: 'Cash',
    currency: 'GBP',
    balance_total_local: 12_000,
    date_updated: '2024-01-01T00:00:00+00:00',
  },
  // Dollar cash: outside the sterling pool entirely.
  {
    institution: 'Chase',
    account_name: 'Checking',
    category: 'Cash',
    currency: 'USD',
    balance_total_local: 97_918,
    date_updated: `${SNAPSHOT}T00:00:00+00:00`,
  },
  // Sterling, but not cash.
  {
    institution: 'Vanguard',
    account_name: 'SIPP',
    category: 'Retirement',
    currency: 'GBP',
    balance_total_local: 157_384,
    date_updated: `${SNAPSHOT}T00:00:00+00:00`,
  },
] as unknown as AccountBalance[]

function gbpRow(date: string, amount: number, extra: Partial<GbpLedgerRow> = {}): GbpLedgerRow {
  return {
    date,
    category: 'General',
    counterparty: 'Groceries',
    currency: 'GBP',
    amount_gbp: amount,
    amount_usd: null,
    ...extra,
  }
}

function run(ledger: GbpLedgerRow[], accounts: AccountBalance[] = ACCOUNTS) {
  return computeGbpAvailable(accounts, ledger, { today: TODAY })
}

describe('GBP available', () => {
  it('is the balance snapshot when no ledger is supplied', () => {
    const result = computeGbpAvailable(ACCOUNTS)

    assert.equal(result.total, 169_263)
    assert.equal(result.balances, 169_263)
    assert.equal(result.sinceBalances, 0)
    assert.equal(result.rowsApplied, 0)
    assert.equal(result.balancesAsOf, SNAPSHOT)
    assert.equal(result.asOf, SNAPSHOT)
    assert.deepEqual(result.accounts, [{ name: 'Current', balance: 169_263 }])
  })

  it('nets sterling booked since the snapshot onto the balance', () => {
    const result = run([
      gbpRow('2026-08-20', -12_000),
      gbpRow('2026-09-01', -3_400),
      gbpRow('2026-08-28', 5_000, { category: 'Income', counterparty: 'Salary' }),
    ])

    assert.equal(result.balances, 169_263)
    assert.equal(result.sinceBalances, -10_400)
    assert.equal(result.total, 158_863)
    assert.equal(result.rowsApplied, 3)
    // The figure is current to the last row it could see, not to the snapshot.
    assert.equal(result.balancesAsOf, SNAPSHOT)
    assert.equal(result.asOf, '2026-09-01')
  })

  it('leaves the snapshot alone for rows dated on or before it', () => {
    // The snapshot is the close of that day, so those rows are already in it.
    const result = run([gbpRow(SNAPSHOT, -5_000), gbpRow('2026-08-12', -9_000)])

    assert.equal(result.total, 169_263)
    assert.equal(result.rowsApplied, 0)
    assert.equal(result.asOf, SNAPSHOT)
  })

  it('ignores future-dated rows, which are commitments rather than spent cash', () => {
    const result = run([gbpRow('2026-08-20', -1_000), gbpRow('2026-12-25', -40_000)])

    assert.equal(result.sinceBalances, -1_000)
    assert.equal(result.rowsApplied, 1)
  })

  it('never spends sterling for a dollar transaction', () => {
    // `amount_gbp` is populated on dollar rows too, as the converted figure.
    // Trusting it would drain the sterling pool for money that left a dollar one.
    const result = run([
      { date: '2026-08-20', category: 'Rent', currency: 'USD', amount_usd: -9_000, amount_gbp: -6_672 },
      gbpRow('2026-08-21', -1_000),
    ])

    assert.equal(result.sinceBalances, -1_000)
    assert.equal(result.rowsApplied, 1)
  })

  it('drops valuation marks and excluded rows, which are not money moving', () => {
    const result = run([
      gbpRow('2026-08-20', 31_000, { counterparty: 'Valuation change' }),
      gbpRow('2026-08-21', 8_000, { category: 'Excluded', counterparty: 'Transfer' }),
      gbpRow('2026-08-22', -2_500),
    ])

    assert.equal(result.sinceBalances, -2_500)
    assert.equal(result.rowsApplied, 1)
  })

  it('takes an unmarked row only when sterling is the sole amount on it', () => {
    const result = run([
      // Pre-dates the currency column but is unambiguously sterling.
      gbpRow('2026-08-20', -1_500, { currency: null, amount_usd: null }),
      // Both amounts and no marker: indistinguishable from a converted dollar row.
      gbpRow('2026-08-21', -4_000, { currency: null, amount_usd: -5_400 }),
      // No amount at all.
      gbpRow('2026-08-22', 0, { currency: null, amount_gbp: null, amount_usd: null }),
    ])

    assert.equal(result.sinceBalances, -1_500)
    assert.equal(result.rowsApplied, 1)
  })

  it('rolls forward from the oldest contributing balance, so no account is skipped', () => {
    const mixedDates = [
      ...ACCOUNTS,
      {
        institution: 'HSBC',
        account_name: 'Savings',
        category: 'Cash',
        currency: 'GBP',
        balance_total_local: 50_000,
        date_updated: '2026-07-01T00:00:00+00:00',
      },
    ] as unknown as AccountBalance[]

    const result = run([gbpRow('2026-07-15', -4_000), gbpRow('2026-08-20', -1_000)], mixedDates)

    assert.equal(result.balances, 219_263)
    assert.equal(result.balancesAsOf, '2026-07-01')
    // Both rows land. The July one is double-counted against the Barclays
    // balance that already reflects it — an understatement, which is the safe
    // direction for a "can I pay for this" figure.
    assert.equal(result.sinceBalances, -5_000)
    assert.equal(result.total, 214_263)
  })

  it('does not roll forward without a snapshot to anchor to', () => {
    const result = run([gbpRow('2026-08-20', -1_000)], [] as unknown as AccountBalance[])

    assert.equal(result.total, 0)
    assert.equal(result.sinceBalances, 0)
    assert.equal(result.balancesAsOf, null)
    assert.equal(result.asOf, null)
  })

  it('keeps ring-fenced capital out of the pool the ledger is applied to', () => {
    const withTrust = [
      ...ACCOUNTS,
      {
        institution: 'Barclays',
        account_name: 'Education trust',
        category: 'Education Trust',
        currency: 'GBP',
        balance_total_local: 4_000_000,
        date_updated: `${SNAPSHOT}T00:00:00+00:00`,
      },
    ] as unknown as AccountBalance[]

    const result = run([gbpRow('2026-08-20', -1_000)], withTrust)

    // Sterling and liquid, but not spendable, so neither the balance nor the
    // roll-forward may reach it.
    assert.equal(result.balances, 169_263)
    assert.equal(result.total, 168_263)
    assert.deepEqual(result.accounts, [{ name: 'Current', balance: 169_263 }])
  })
})
