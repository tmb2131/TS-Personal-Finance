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
  /** Implied change in overall forecast if there is no more spend today (tomorrow total − today total). Positive = forecast rises. */
  impliedForecastChange: number | null
  /** Total forecast as of end of previous day (YTD excluding today's spend); stable for the day. */
  totalForecastToday?: number | null
  /** Total forecast at end of day if no more spend today; used for optional display. */
  totalForecastTomorrowAtZero?: number | null
  /** For each methodology, the category names that use it (for filtering transactions). */
  categoriesByMethodology: Record<string, string[]>
}
