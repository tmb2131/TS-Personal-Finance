const EXCLUDED_CATEGORY_NAME = 'Excluded' as const

const INCOME_CATEGORY_NAMES = ['Income', 'Gift Money', 'Other Income'] as const

const INCOME_CATEGORY_SET = new Set<string>(INCOME_CATEGORY_NAMES)

export const EXCLUDED_CATEGORY = EXCLUDED_CATEGORY_NAME

/**
 * Counterparties whose ledger rows are non-cash mark-to-market entries.
 *
 * "Valuation change" rows revalue an illiquid holding and book as a sterling
 * inflow, so any cash-flow aggregation that trusts the sign reads them as
 * income that never arrived. They are currently filed under the `Excluded`
 * category, which already keeps them out of most totals — but that is a
 * property of how the sheet happens to be categorised, not a guarantee. A
 * single recategorisation upstream would silently reintroduce the phantom
 * income, so the exclusion is enforced here on the counterparty as well.
 *
 * Matched on the exact normalized name, never as a substring: real expenses
 * such as "Prestige Valuations" must keep flowing through.
 */
const NON_CASH_COUNTERPARTY_NAMES = ['valuation change'] as const

const NON_CASH_COUNTERPARTY_SET = new Set<string>(NON_CASH_COUNTERPARTY_NAMES)

export function isExcludedCategory(category: string | null | undefined): boolean {
  return category === EXCLUDED_CATEGORY_NAME
}

export function isIncomeCategory(category: string | null | undefined): boolean {
  return Boolean(category && INCOME_CATEGORY_SET.has(category))
}

export function isExpenseCategory(category: string | null | undefined): boolean {
  if (!category) return false
  return !isIncomeCategory(category) && !isExcludedCategory(category)
}

/** True when the counterparty marks a non-cash valuation entry rather than money moving. */
export function isNonCashCounterparty(counterparty: string | null | undefined): boolean {
  if (!counterparty) return false
  return NON_CASH_COUNTERPARTY_SET.has(counterparty.toString().trim().toLowerCase())
}

export type CashFlowRow = {
  category?: string | null
  counterparty?: string | null
}

/**
 * True when a ledger row represents real money moving and may therefore feed
 * spend, income, forecast, or runway figures. Callers that only care about the
 * expense side should still gate on `isExpenseCategory`.
 */
export function isCashFlowRow(row: CashFlowRow): boolean {
  if (isNonCashCounterparty(row.counterparty)) return false
  return !isExcludedCategory(row.category)
}

/** Expense-side rows only: real money out, excluding income and non-cash entries. */
export function isExpenseCashFlowRow(row: CashFlowRow): boolean {
  if (isNonCashCounterparty(row.counterparty)) return false
  return isExpenseCategory(row.category)
}
