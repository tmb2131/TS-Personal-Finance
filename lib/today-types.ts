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
  /** Total forecast today (sum over categories); used for optional display. */
  totalForecastToday?: number | null
  /** Total forecast at end of day if no more spend today; used for optional display. */
  totalForecastTomorrowAtZero?: number | null
}
