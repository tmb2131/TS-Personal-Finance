import type { MonthToDateSummary } from '@/lib/month-to-date'

export type TodayTransactionRow = {
  id: string
  date: string
  category: string
  counterparty: string | null
  amount_gbp: number | null
  amount_usd: number | null
}

export type TodayPageData = {
  transactions: TodayTransactionRow[]
  spendByCategory: Record<string, number>
  spendByMethodology: Record<string, number>
  headroomByMethodology: Record<string, number | null>
  /** Sum of annual budgets for categories in each methodology; used to exclude methodology from chart if 0. */
  budgetSumByMethodology: Record<string, number>
  /** Forecast change over today if no more spend (today's snapshot forecast − end-of-yesterday forecast). Positive = forecast rises. Snapshot-based; ties out with "Change Since Yesterday". */
  impliedForecastChange: number | null
  /** Est. annual spend using same day fraction as Dashboard (dayOfYear/daysInYear). */
  totalForecastAtCurrentYtd?: number | null
  /** Forecast at end of yesterday (for day-over-day gap delta; matches Analysis chart). */
  totalForecastEndOfYesterday?: number | null
  /** Total forecast at end of day if no more spend today; used for optional display. */
  totalForecastTomorrowAtZero?: number | null
  /** For each methodology, the category names that use it (for filtering transactions). */
  categoriesByMethodology: Record<string, string[]>
  /** Total expense spend today (positive number, GBP). */
  totalSpentToday: number
  /** Sum of annual budgets for all expense categories (positive number, GBP). */
  expensesBudgetTotal: number
  /**
   * Current gap to expenses budget using the start-of-day forecast (today's day
   * fraction, YTD excludes today's spend).
   *
   * SIGN CONVENTION: gap = annualBudget - forecast, and expense budgets and
   * forecasts are both negative, so a budget of -21,000 against a forecast of
   * -22,676 gives +1,676. Positive therefore means OVER budget, matching
   * Analysis > Forecast Evolution. Reading positive as "under" is the natural
   * mistake and it shipped once already.
   */
  gapToBudgetCurrent: number | null
  /** Gap to expenses budget at current YTD. Same sign convention as `gapToBudgetCurrent`: positive = over budget. */
  gapToBudgetIfNoMoreSpend: number | null
  /**
   * Month-to-date spend against this month's expected run rate. The lead
   * figure for the Today section — see lib/month-to-date.ts for why a daily
   * allowance was the wrong instrument for this household.
   */
  monthToDate: MonthToDateSummary
}
