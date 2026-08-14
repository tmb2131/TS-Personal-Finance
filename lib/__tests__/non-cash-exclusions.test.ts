import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isCashFlowRow,
  isExpenseCashFlowRow,
  isNonCashCounterparty,
} from '../category-filters.ts'
import { computeExpenseYtdByCategory } from '../expense-ytd.ts'
import { buildMonthlyGrid, type ForecastTxRow } from '../forecast-transaction-based.ts'
import { detectRecurringPayments } from '../utils/detect-recurring-payments.ts'
import { excludeTrustAccounts, isTrustAccount } from '../trust-exclusions.ts'
import type { TransactionLog } from '../types.ts'

/**
 * "Valuation change" rows are non-cash mark-to-market entries that book as
 * sterling inflows. They currently arrive categorised `Excluded`, which already
 * keeps them out of most totals — so these fixtures deliberately place them in
 * spendable categories too, to prove the exclusion holds on the counterparty
 * alone and does not depend on upstream categorisation staying correct.
 */

describe('isNonCashCounterparty', () => {
  it('matches the valuation change counterparty regardless of case and padding', () => {
    assert.equal(isNonCashCounterparty('Valuation change'), true)
    assert.equal(isNonCashCounterparty('  valuation CHANGE '), true)
  })

  it('does not match real counterparties that merely contain the word', () => {
    // A genuine £85 expense in the ledger. Substring matching would eat it.
    assert.equal(isNonCashCounterparty('Prestige Valuations'), false)
    assert.equal(isNonCashCounterparty('Valuation change fee'), false)
    assert.equal(isNonCashCounterparty(null), false)
    assert.equal(isNonCashCounterparty(''), false)
  })
})

describe('cash-flow row guards', () => {
  it('rejects a valuation change row even under a spendable category', () => {
    const row = { category: 'Income', counterparty: 'Valuation change' }
    assert.equal(isCashFlowRow(row), false)
    assert.equal(isExpenseCashFlowRow({ ...row, category: 'Household' }), false)
  })

  it('keeps ordinary rows', () => {
    assert.equal(isCashFlowRow({ category: 'Income', counterparty: 'Employer' }), true)
    assert.equal(
      isExpenseCashFlowRow({ category: 'Household', counterparty: 'Prestige Valuations' }),
      true,
    )
  })
})

describe('expense YTD', () => {
  it('excludes valuation change rows from the category totals', () => {
    const rows = [
      { category: 'Household', counterparty: 'Waitrose', date: '2026-02-10', amount_gbp: -500, amount_usd: null },
      { category: 'Household', counterparty: 'Valuation change', date: '2026-03-19', amount_gbp: 8_000, amount_usd: null },
    ]

    const ytd = computeExpenseYtdByCategory(rows, {
      year: 2026,
      asOf: '2026-12-31',
      gbpUsdRate: 1.35,
      expenseOnly: true,
    })

    // Without the guard the phantom +8,000 inflow would net the category to +7,500.
    assert.equal(ytd.get('Household'), -500)
  })
})

describe('transaction-based forecast grid', () => {
  it('keeps mark-to-market entries out of the monthly spend grid', () => {
    const rows: ForecastTxRow[] = [
      { date: '2026-03-02', category: 'Household', counterparty: 'Waitrose', amount_gbp: -300, amount_usd: null },
      { date: '2026-03-19', category: 'Household', counterparty: 'Valuation change', amount_gbp: 8_000, amount_usd: null },
      { date: '2026-04-19', category: 'Household', counterparty: 'Valuation change', amount_gbp: 31_000, amount_usd: null },
    ]

    const { grid } = buildMonthlyGrid(rows, 1.35)

    // Grid stores net spend as a positive number, so the real outflow is +300
    // and the two valuation entries contribute nothing at all.
    assert.equal(grid['Household']?.['2026-03'], 300)
    assert.equal(grid['Household']?.['2026-04'], undefined)
  })
})

describe('recurring payment detection', () => {
  it('does not report a monthly valuation change as a recurring payment', () => {
    const today = new Date()
    const monthsBack = (n: number) => {
      const d = new Date(today)
      d.setMonth(d.getMonth() - n)
      return d.toISOString().slice(0, 10)
    }

    // Six consecutive months of identical entries — a textbook recurring
    // signature, filed under a spendable category.
    const transactions = Array.from({ length: 6 }, (_, i) => ({
      id: `valuation-${i}`,
      date: monthsBack(i),
      category: 'Household',
      counterparty: 'Valuation change',
      counterparty_dedup: 'valuation change',
      amount_gbp: 8_000,
      amount_usd: null,
    })) as TransactionLog[]

    const detected = detectRecurringPayments(transactions, 'GBP', 1.35)

    assert.equal(
      detected.some((p) => p.counterpartyName.toLowerCase().includes('valuation change')),
      false,
    )
  })
})

describe('trust exclusions', () => {
  it('identifies trust-held accounts by category', () => {
    assert.equal(isTrustAccount({ category: 'Trust' }), true)
    assert.equal(isTrustAccount({ category: 'trust' }), true)
    assert.equal(isTrustAccount({ category: 'Education Trust' }), true)
    assert.equal(isTrustAccount({ category: 'Cash' }), false)
    assert.equal(isTrustAccount({ category: null }), false)
  })

  it('drops trust capital from a spendable account list', () => {
    const accounts = [
      { category: 'Cash', balance: 8_141 },
      { category: 'Brokerage', balance: 749_154 },
      { category: 'Trust', balance: 6_235_436 },
    ]

    const spendable = excludeTrustAccounts(accounts)

    assert.equal(spendable.length, 2)
    assert.equal(
      spendable.reduce((sum, a) => sum + a.balance, 0),
      757_295,
    )
  })
})
