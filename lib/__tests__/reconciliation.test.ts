import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { reconcileLedgerToBalances, type LedgerEntry } from '../reconciliation.ts'

const window = { periodStart: '2026-01-01', periodEnd: '2026-07-31' }

function entry(date: string, amount: number, counterparty = 'Groceries'): LedgerEntry {
  return { date, amount, currency: 'GBP', counterparty, category: 'General' }
}

describe('reconcileLedgerToBalances', () => {
  it('passes when the ledger explains the balance change', () => {
    const result = reconcileLedgerToBalances({
      currency: 'GBP',
      openingBalance: 302_347,
      closingBalance: 207_118,
      ...window,
      entries: [entry('2026-03-01', -50_000), entry('2026-05-01', -45_229)],
    })

    assert.equal(result.reconciled, true)
    assert.ok(Math.abs((result.discrepancy) - (0)) < Math.pow(10, -(0)) * 5, `expected ${result.discrepancy} close to ${0}`)
  })

  it('catches non-cash valuation rows booked as cash', () => {
    // The real case: GBP model sat £37,855 above the bank because of these two.
    const result = reconcileLedgerToBalances({
      currency: 'GBP',
      openingBalance: 302_347,
      closingBalance: 169_263,
      ...window,
      entries: [
        entry('2026-02-01', -134_229),
        entry('2026-03-19', 8_000, 'Valuation change'),
        entry('2026-04-19', 31_000, 'Valuation change'),
      ],
    })

    assert.equal(result.reconciled, false)
    // Ledger says -95,229; the bank says -133,084.
    assert.ok(Math.abs((result.discrepancy) - (37_855)) < Math.pow(10, -(0)) * 5, `expected ${result.discrepancy} close to ${37_855}`)
    assert.equal((result.suspects).length, 2)
    assert.equal(result.suspects.every((s) => s.reason === 'non_cash_pattern'), true)
    // Strip the 39,000 of non-cash rows and the residual matches the USD side's noise.
    assert.ok(Math.abs((result.residualAfterSuspects) - (-1_145)) < Math.pow(10, -(0)) * 5, `expected ${result.residualAfterSuspects} close to ${-1_145}`)
    assert.ok((Math.abs(result.residualAfterSuspects)) < (2_000))
  })

  it('ignores entries outside the window and in other currencies', () => {
    const result = reconcileLedgerToBalances({
      currency: 'GBP',
      openingBalance: 1_000,
      closingBalance: 900,
      ...window,
      entries: [
        entry('2026-03-01', -100),
        entry('2025-12-31', -5_000),
        { date: '2026-03-01', amount: -9_999, currency: 'USD', counterparty: 'Rent' },
      ],
    })

    assert.equal(result.reconciled, true)
  })

  it('flags an unpaired large transfer with no telltale counterparty', () => {
    const result = reconcileLedgerToBalances({
      currency: 'GBP',
      openingBalance: 100_000,
      closingBalance: 40_000,
      ...window,
      entries: [entry('2026-03-01', -10_000), entry('2026-04-01', 50_000, 'Internal move')],
      tolerance: 250,
    })

    assert.equal(result.reconciled, false)
    assert.equal(result.suspects.some((s) => s.reason === 'unpaired_large_transfer'), true)
  })

  it('does not flag a transfer that has a matching opposite leg', () => {
    const result = reconcileLedgerToBalances({
      currency: 'GBP',
      openingBalance: 100_000,
      closingBalance: 99_000,
      ...window,
      entries: [
        entry('2026-03-01', -1_000),
        entry('2026-04-01', 25_000, 'Transfer in'),
        entry('2026-04-01', -25_000, 'Transfer out'),
      ],
    })

    assert.equal(result.reconciled, true)
    assert.equal((result.suspects).length, 0)
  })
})
