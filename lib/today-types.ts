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
  /** Forecast change if no more spend today (tomorrowAtZero − startOfToday). Positive = forecast rises. Snapshot-based; matches Daily Summary. */
  impliedForecastChange: number | null
  /** Total expense forecast at start of today (snapshot aggregation, excludes today's spend from YTD). */
  totalForecastToday?: number | null
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
  /** Current gap to expenses budget: expensesBudgetTotal - totalForecastToday. Positive = under budget. */
  gapToBudgetCurrent: number | null
  /** Gap to expenses budget at current YTD: expensesBudgetTotal - totalForecastAtCurrentYtd. Uses same day fraction as Dashboard. */
  gapToBudgetIfNoMoreSpend: number | null
}
