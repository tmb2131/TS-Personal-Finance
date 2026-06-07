import { isExpenseCategory } from '@/lib/category-filters'
import { todayLocalDateString } from '@/lib/date-utils'

export type ExpenseYtdTx = {
  category: string | null
  date: string | Date | null | undefined | unknown
  amount_gbp: number | null
  amount_usd: number | null
}

export type ExpenseYtdOptions = {
  year: number
  /** YYYY-MM-DD inclusive end date. Defaults to today for current year, Dec 31 for past years. */
  asOf?: string
  gbpUsdRate: number
  /** When true, only expense categories (excludes Income, Gift Money, Other Income, Excluded). */
  expenseOnly?: boolean
}

/** Prefer GBP; else USD ÷ current rate. Matches dashboard `computeAnnualForecasts` normalization. */
export function normalizeAmountGBP(
  amountGBP: number | null,
  amountUSD: number | null,
  gbpUsdRate: number,
): number {
  if (amountGBP != null && !Number.isNaN(Number(amountGBP))) return Number(amountGBP)
  if (amountUSD != null && !Number.isNaN(Number(amountUSD))) return Number(amountUSD) / gbpUsdRate
  return 0
}

const toDateOnly = (value: ExpenseYtdTx['date']): string => {
  if (!value) return ''
  if (typeof value === 'string') return value.split('T')[0]
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().split('T')[0]
  }
  const d = new Date(value as string | number)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0]
}

/** Default as-of date: today for the current calendar year, else full year end. */
export function defaultExpenseYtdAsOf(year: number, asOf?: string): string {
  if (asOf) return asOf
  const currentYear = new Date().getFullYear()
  if (year === currentYear) return todayLocalDateString()
  return `${year}-12-31`
}

/**
 * Sum signed GBP amounts per category for a calendar year through `asOf`.
 * Expenses are negative in transaction_log; refunds are positive.
 * Set `expenseOnly: true` to restrict to expense categories.
 */
export function computeExpenseYtdByCategory(
  rows: ExpenseYtdTx[],
  options: ExpenseYtdOptions,
): Map<string, number> {
  const { year, gbpUsdRate, expenseOnly = false } = options
  const startDate = `${year}-01-01`
  const endDate = defaultExpenseYtdAsOf(year, options.asOf)
  const ytd = new Map<string, number>()

  for (const tx of rows) {
    if (!tx.category) continue
    if (expenseOnly && !isExpenseCategory(tx.category)) continue
    const dateStr = toDateOnly(tx.date)
    if (!dateStr || dateStr < startDate || dateStr > endDate) continue
    const amount = normalizeAmountGBP(tx.amount_gbp, tx.amount_usd, gbpUsdRate)
    if (amount === 0) continue
    ytd.set(tx.category, (ytd.get(tx.category) ?? 0) + amount)
  }

  return ytd
}

/** Display magnitude for expense YTD (expenses stored negative). */
export function expenseYtdMagnitude(signedGbp: number): number {
  return Math.abs(signedGbp)
}

/**
 * Total expense YTD magnitude across categories.
 * When `categories` is provided, only those expense categories are summed (budget-scoped total).
 */
export function computeTotalExpenseYtd(
  byCategory: Map<string, number>,
  categories?: Iterable<string>,
): number {
  if (categories) {
    let total = 0
    for (const category of categories) {
      if (!isExpenseCategory(category)) continue
      total += expenseYtdMagnitude(byCategory.get(category) ?? 0)
    }
    return total
  }

  let total = 0
  for (const [, signed] of byCategory) {
    total += expenseYtdMagnitude(signed)
  }
  return total
}

/** Signed YTD for one category; 0 when missing. */
export function getExpenseYtdSigned(byCategory: Map<string, number>, category: string): number {
  return byCategory.get(category) ?? 0
}
