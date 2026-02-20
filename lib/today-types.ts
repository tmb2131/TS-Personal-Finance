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
  /** Implied change in overall forecast if there is no more spend today (tomorrow total − today total). Positive = forecast rises. */
  impliedForecastChange: number | null
}
