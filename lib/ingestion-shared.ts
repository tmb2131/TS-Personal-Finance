export const DUMMY_SHEET_ID = '1BxVuJ-DViN5nqpLc-8tGXex_pYiPY8dfL8UV5czCrHY'

export type IngestionSourceId = 'google_sheet' | 'csv' | 'manual'
export type IngestionFreshness = 'fresh' | 'stale' | 'setup'

export interface IngestionDatasetStatus {
  id: 'transactions' | 'account_balances' | 'recurring_payments'
  label: string
  totalRows: number
  latestDate: string | null
  needsReviewCount: number
  sources: Record<IngestionSourceId, number>
}

export interface IngestionSourceStatus {
  id: IngestionSourceId
  label: string
  connected: boolean
  status: 'healthy' | 'attention' | 'idle'
  totalRows: number
  description: string
}

export interface IngestionStatusSnapshot {
  freshness: IngestionFreshness
  freshnessLabel: string
  lastSyncAt: string | null
  latestTransactionDate: string | null
  maxAccountDate: string | null
  lastIngestedAt: string | null
  connectedSources: number
  readyDatasets: number
  reviewItems: number
  sheetConnected: boolean
  hasSampleData: boolean
  sources: IngestionSourceStatus[]
  datasets: IngestionDatasetStatus[]
}
