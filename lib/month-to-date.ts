import { isExpenseCashFlowRow } from '@/lib/category-filters'

/**
 * Month-to-date spend against what this month normally costs.
 *
 * The Today section led with "Spent today" and two daily allowances ("Room to
 * spend — £311 left (Annual) / £193 left (Linear)"). A daily allowance is the
 * wrong instrument for a household whose annual spend is driven by childcare,
 * school fees, holidays and tax: those are lumpy commitments already decided
 * months ago, not discretionary daily choices. Showing two allowances with no
 * stated difference between them compounded it.
 *
 * The expected month total here is deliberately NOT the annual figure divided
 * by twelve. That would push the same linear assumption up one level and call
 * January and September equivalent. It is the annual forecast apportioned by
 * this calendar month's own historical share of annual spend, so a month that
 * has always carried school fees is expected to carry them again.
 */

export type MonthToDateTxRow = {
  category?: string | null
  counterparty?: string | null
  /** `unknown` to match `TxRowForecast`; normalized to `YYYY-MM-DD` below. */
  date?: unknown
  amount_gbp?: number | null
  amount_usd?: number | null
}

export interface MonthToDateSummary {
  /** Expense spend so far this calendar month, GBP, positive. */
  spendToDate: number
  /** What this whole month is expected to cost, GBP, positive. */
  expectedMonthTotal: number
  /**
   * Expected spend by this point in the month, GBP, positive. Prorated within
   * the month only — the across-month shape comes from history.
   */
  expectedToDate: number
  /** spendToDate − expectedToDate. Positive means ahead of the run rate. */
  varianceToDate: number
  dayOfMonth: number
  daysInMonth: number
  /** How this month's share of the annual total was arrived at. */
  basis: 'history' | 'even-split'
  /** Prior years of the same calendar month that fed the share. */
  historyYears: number
}

/** Years of history to average this month's share over. */
const SHARE_HISTORY_YEARS = 3

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

function toGbpAmount(row: MonthToDateTxRow, gbpUsdRate: number): number {
  if (row.amount_gbp != null) return Number(row.amount_gbp)
  if (row.amount_usd != null && gbpUsdRate > 0) return Number(row.amount_usd) / gbpUsdRate
  return 0
}

/** Expense rows only, and never the non-cash valuation entries. */
function expenseGbp(row: MonthToDateTxRow, gbpUsdRate: number): number {
  if (!isExpenseCashFlowRow({ category: row.category, counterparty: row.counterparty })) return 0
  const gbp = toGbpAmount(row, gbpUsdRate)
  // Expenses book negative; a refund inside the month legitimately nets off.
  return -gbp
}

export function computeMonthToDate(params: {
  transactions: MonthToDateTxRow[]
  /** Forecast total expense spend for the year, GBP, positive. */
  annualForecastSpend: number
  gbpUsdRate: number
  /** `YYYY-MM-DD`. */
  asOf: string
}): MonthToDateSummary {
  const { transactions, annualForecastSpend, gbpUsdRate, asOf } = params

  const asOfDate = new Date(`${asOf}T00:00:00Z`)
  const year = asOfDate.getUTCFullYear()
  const monthIndex = asOfDate.getUTCMonth()
  const dayOfMonth = asOfDate.getUTCDate()
  const totalDays = daysInMonth(year, monthIndex)

  const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`

  let spendToDate = 0
  // Spend for this calendar month in each prior year, and that year's total.
  const priorMonthSpend = new Map<number, number>()
  const priorYearSpend = new Map<number, number>()

  for (const row of transactions) {
    const date = String(row.date ?? '').slice(0, 10)
    if (!date) continue

    const amount = expenseGbp(row, gbpUsdRate)
    if (amount === 0) continue

    const rowYear = Number(date.slice(0, 4))
    const rowMonth = date.slice(0, 7)

    if (rowMonth === monthPrefix && date <= asOf) {
      spendToDate += amount
      continue
    }

    // Prior years only: the current year is incomplete and would bias the share.
    if (rowYear >= year || rowYear < year - SHARE_HISTORY_YEARS) continue
    priorYearSpend.set(rowYear, (priorYearSpend.get(rowYear) ?? 0) + amount)
    if (Number(rowMonth.slice(5, 7)) === monthIndex + 1) {
      priorMonthSpend.set(rowYear, (priorMonthSpend.get(rowYear) ?? 0) + amount)
    }
  }

  // A year only contributes a share if it has meaningful spend to divide by.
  const shares: number[] = []
  for (const [priorYear, yearTotal] of priorYearSpend) {
    if (yearTotal <= 0) continue
    const monthTotal = priorMonthSpend.get(priorYear) ?? 0
    if (monthTotal < 0) continue
    shares.push(monthTotal / yearTotal)
  }

  const evenSplit = 1 / 12
  const share =
    shares.length > 0 ? shares.reduce((sum, s) => sum + s, 0) / shares.length : evenSplit

  const expectedMonthTotal = Math.max(0, annualForecastSpend) * share
  const expectedToDate = expectedMonthTotal * (dayOfMonth / totalDays)

  return {
    spendToDate: Math.max(0, spendToDate),
    expectedMonthTotal,
    expectedToDate,
    varianceToDate: Math.max(0, spendToDate) - expectedToDate,
    dayOfMonth,
    daysInMonth: totalDays,
    basis: shares.length > 0 ? 'history' : 'even-split',
    historyYears: shares.length,
  }
}
