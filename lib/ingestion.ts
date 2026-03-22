import type { SupabaseClient } from '@supabase/supabase-js'
import { CACHE_TAGS, revalidateAllData, revalidateTags } from '@/lib/cache-tags'
import {
  DUMMY_SHEET_ID,
  type IngestionDatasetStatus,
  type IngestionFreshness,
  type IngestionSourceId,
  type IngestionSourceStatus,
  type IngestionStatusSnapshot,
} from '@/lib/ingestion-shared'
import { rebuildHistoricalNetWorthFromAccountHistory } from '@/lib/snapshot-historical-net-worth'
import { recordLastSync } from '@/lib/sync-metadata'
import { rebuildYoYNetWorthFromAppData } from '@/lib/yoy-net-worth'

interface FinalizeDataPipelineOptions {
  supabase: SupabaseClient
  userId: string
  context: string
  rebuildHistoricalNetWorth?: boolean
  rebuildYoYNetWorth?: boolean
  recordSyncTimestamp?: boolean
  revalidate?: 'all' | string[]
}

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'No data yet'

  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return 'No data yet'

  const diffMs = Date.now() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
  if (diffHours > 0) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`

  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  if (diffMinutes <= 1) return 'Just now'
  return `${diffMinutes} minutes ago`
}

function getMostRecentDate(...values: Array<string | null>): string | null {
  const timestamps = values
    .map((value) => (value ? new Date(value).getTime() : Number.NaN))
    .filter((value) => Number.isFinite(value))

  if (timestamps.length === 0) return null
  return new Date(Math.max(...timestamps)).toISOString()
}

async function countRows(
  supabase: SupabaseClient,
  table: 'transaction_log' | 'account_balances' | 'recurring_payments',
  userId: string,
  filters: Record<string, string | number | boolean | null> = {}
): Promise<number> {
  let query = supabase.from(table).select('*', { count: 'exact', head: true }).eq('user_id', userId)

  for (const [column, value] of Object.entries(filters)) {
    query = value === null ? query.is(column, null) : query.eq(column, value)
  }

  const { count } = await query
  return count ?? 0
}

async function fetchLatestDateForSource(
  supabase: SupabaseClient,
  table: 'transaction_log' | 'account_balances',
  dateColumn: 'date' | 'date_updated',
  userId: string,
  dataSource: IngestionSourceId
): Promise<string | null> {
  const { data } = await supabase
    .from(table)
    .select(dateColumn)
    .eq('user_id', userId)
    .eq('data_source', dataSource)
    .order(dateColumn, { ascending: false })
    .limit(1)

  const row = data?.[0] as Record<string, string> | undefined
  return row?.[dateColumn] ?? null
}

export async function finalizeDataPipeline({
  supabase,
  userId,
  context,
  rebuildHistoricalNetWorth = false,
  rebuildYoYNetWorth = false,
  recordSyncTimestamp = false,
  revalidate,
}: FinalizeDataPipelineOptions): Promise<{ warnings: string[] }> {
  const warnings: string[] = []

  if (rebuildHistoricalNetWorth) {
    try {
      await rebuildHistoricalNetWorthFromAccountHistory(supabase, userId)
    } catch (error) {
      console.error(`${context}: failed to rebuild historical net worth data`, error)
      warnings.push('historical_net_worth')
    }
  }

  if (rebuildYoYNetWorth) {
    try {
      await rebuildYoYNetWorthFromAppData(supabase, userId)
    } catch (error) {
      console.error(`${context}: failed to rebuild YoY net worth data`, error)
      warnings.push('yoy_net_worth')
    }
  }

  if (recordSyncTimestamp) {
    try {
      await recordLastSync(supabase, userId)
    } catch (error) {
      console.error(`${context}: failed to record sync timestamp`, error)
      warnings.push('sync_metadata')
    }
  }

  if (revalidate === 'all') {
    revalidateAllData()
  } else if (revalidate && revalidate.length > 0) {
    revalidateTags(...revalidate)
  }

  return { warnings }
}

export async function getIngestionStatusSnapshot(
  supabase: SupabaseClient,
  userId: string
): Promise<IngestionStatusSnapshot> {
  const [
    profileResult,
    syncResult,
    latestTransactionResult,
    latestAccountResult,
    txSheetCount,
    txCsvCount,
    txManualCount,
    accountSheetCount,
    accountCsvCount,
    accountManualCount,
    recurringSheetCount,
    recurringCsvCount,
    recurringManualCount,
    uncategorizedTransactions,
    recurringNeedsReview,
    sheetTransactionDate,
    csvTransactionDate,
    manualTransactionDate,
    sheetAccountDate,
    csvAccountDate,
    manualAccountDate,
    accountSplits,
  ] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('google_spreadsheet_id')
      .eq('id', userId)
      .single(),
    supabase.from('sync_metadata').select('last_sync_at').eq('user_id', userId).maybeSingle(),
    supabase.from('transaction_log').select('date').eq('user_id', userId).order('date', { ascending: false }).limit(1),
    supabase
      .from('account_balances')
      .select('date_updated')
      .eq('user_id', userId)
      .order('date_updated', { ascending: false })
      .limit(1),
    countRows(supabase, 'transaction_log', userId, { data_source: 'google_sheet' }),
    countRows(supabase, 'transaction_log', userId, { data_source: 'csv' }),
    countRows(supabase, 'transaction_log', userId, { data_source: 'manual' }),
    countRows(supabase, 'account_balances', userId, { data_source: 'google_sheet' }),
    countRows(supabase, 'account_balances', userId, { data_source: 'csv' }),
    countRows(supabase, 'account_balances', userId, { data_source: 'manual' }),
    countRows(supabase, 'recurring_payments', userId, { data_source: 'google_sheet' }),
    countRows(supabase, 'recurring_payments', userId, { data_source: 'csv' }),
    countRows(supabase, 'recurring_payments', userId, { data_source: 'manual' }),
    countRows(supabase, 'transaction_log', userId, { category: 'Uncategorized' }),
    countRows(supabase, 'recurring_payments', userId, { needs_review: true }),
    fetchLatestDateForSource(supabase, 'transaction_log', 'date', userId, 'google_sheet'),
    fetchLatestDateForSource(supabase, 'transaction_log', 'date', userId, 'csv'),
    fetchLatestDateForSource(supabase, 'transaction_log', 'date', userId, 'manual'),
    fetchLatestDateForSource(supabase, 'account_balances', 'date_updated', userId, 'google_sheet'),
    fetchLatestDateForSource(supabase, 'account_balances', 'date_updated', userId, 'csv'),
    fetchLatestDateForSource(supabase, 'account_balances', 'date_updated', userId, 'manual'),
    supabase
      .from('account_balances')
      .select('balance_total_local, balance_personal_local, balance_family_local')
      .eq('user_id', userId),
  ])

  const sheetId = profileResult.data?.google_spreadsheet_id?.trim() ?? ''
  const sheetConnected = sheetId.length > 0
  const hasSampleData = sheetId === DUMMY_SHEET_ID
  const lastSyncAt = syncResult.data?.last_sync_at ?? null
  const latestTransactionDate = latestTransactionResult.data?.[0]?.date ?? null
  const maxAccountDate = latestAccountResult.data?.[0]?.date_updated ?? null
  const lastIngestedAt = getMostRecentDate(lastSyncAt, latestTransactionDate, maxAccountDate)

  const totalSheetRows = txSheetCount + accountSheetCount + recurringSheetCount
  const totalCsvRows = txCsvCount + accountCsvCount + recurringCsvCount
  const totalManualRows = txManualCount + accountManualCount + recurringManualCount
  const lastSheetActivityAt = getMostRecentDate(lastSyncAt, sheetTransactionDate, sheetAccountDate)
  const lastCsvActivityAt = getMostRecentDate(csvTransactionDate, csvAccountDate)
  const lastManualActivityAt = getMostRecentDate(manualTransactionDate, manualAccountDate)

  const accountMismatchCount = (accountSplits.data ?? []).reduce((count, row) => {
    const delta = Math.abs((row.balance_personal_local ?? 0) + (row.balance_family_local ?? 0) - (row.balance_total_local ?? 0))
    return count + (delta > 0.01 ? 1 : 0)
  }, 0)

  const transactionsStatus: IngestionDatasetStatus = {
    id: 'transactions',
    label: 'Transactions',
    totalRows: txSheetCount + txCsvCount + txManualCount,
    latestDate: latestTransactionDate,
    needsReviewCount: uncategorizedTransactions,
    sources: {
      google_sheet: txSheetCount,
      csv: txCsvCount,
      manual: txManualCount,
    },
  }

  const accountsStatus: IngestionDatasetStatus = {
    id: 'account_balances',
    label: 'Account balances',
    totalRows: accountSheetCount + accountCsvCount + accountManualCount,
    latestDate: maxAccountDate,
    needsReviewCount: accountMismatchCount,
    sources: {
      google_sheet: accountSheetCount,
      csv: accountCsvCount,
      manual: accountManualCount,
    },
  }

  const recurringStatus: IngestionDatasetStatus = {
    id: 'recurring_payments',
    label: 'Recurring payments',
    totalRows: recurringSheetCount + recurringCsvCount + recurringManualCount,
    latestDate: null,
    needsReviewCount: recurringNeedsReview,
    sources: {
      google_sheet: recurringSheetCount,
      csv: recurringCsvCount,
      manual: recurringManualCount,
    },
  }

  const reviewItems =
    transactionsStatus.needsReviewCount + accountsStatus.needsReviewCount + recurringStatus.needsReviewCount

  let freshness: IngestionFreshness = 'setup'
  if (lastIngestedAt) {
    const ageHours = (Date.now() - new Date(lastIngestedAt).getTime()) / (1000 * 60 * 60)
    freshness = ageHours <= 24 ? 'fresh' : 'stale'
  }

  const freshnessLabel =
    freshness === 'setup'
      ? 'Add a source to start building your finance timeline'
      : freshness === 'fresh'
        ? `Fresh data updated ${formatRelativeTime(lastIngestedAt)}`
        : `Needs refresh, last updated ${formatRelativeTime(lastIngestedAt)}`

  const sources: IngestionSourceStatus[] = [
    {
      id: 'google_sheet',
      label: hasSampleData ? 'Sample sheet' : 'Google Sheet',
      connected: sheetConnected,
      status: !sheetConnected ? 'idle' : freshness === 'stale' ? 'attention' : 'healthy',
      totalRows: totalSheetRows,
      description: !sheetConnected
        ? 'Optional connector for transaction log refreshes.'
        : hasSampleData
          ? `Sample data connected. Last refreshed ${formatRelativeTime(lastSheetActivityAt)}.`
          : `Sheet source connected. Last refreshed ${formatRelativeTime(lastSheetActivityAt)}.`,
    },
    {
      id: 'csv',
      label: 'CSV imports',
      connected: totalCsvRows > 0,
      status: totalCsvRows > 0 ? 'healthy' : 'idle',
      totalRows: totalCsvRows,
      description:
        totalCsvRows > 0
          ? `${totalCsvRows.toLocaleString()} imported row${totalCsvRows === 1 ? '' : 's'} available. Latest dated activity ${formatRelativeTime(lastCsvActivityAt)}.`
          : 'Use CSV imports for balances, transactions, and recurring payments.',
    },
    {
      id: 'manual',
      label: 'Manual entries',
      connected: totalManualRows > 0,
      status: totalManualRows > 0 ? 'healthy' : 'idle',
      totalRows: totalManualRows,
      description:
        totalManualRows > 0
          ? `${totalManualRows.toLocaleString()} in-app row${totalManualRows === 1 ? '' : 's'} entered manually. Latest dated activity ${formatRelativeTime(lastManualActivityAt)}.`
          : 'Add or edit balances, budgets, and transactions directly in the app.',
    },
  ]

  return {
    freshness,
    freshnessLabel,
    lastSyncAt,
    latestTransactionDate,
    maxAccountDate,
    lastIngestedAt,
    connectedSources: sources.filter((source) => source.connected).length,
    readyDatasets: [transactionsStatus, accountsStatus, recurringStatus].filter((dataset) => dataset.totalRows > 0).length,
    reviewItems,
    sheetConnected,
    hasSampleData,
    sources,
    datasets: [transactionsStatus, accountsStatus, recurringStatus],
  }
}

export const INGESTION_NET_WORTH_TAGS = [
  CACHE_TAGS.ACCOUNTS,
  CACHE_TAGS.BUDGETS,
  CACHE_TAGS.NET_WORTH,
  CACHE_TAGS.TRANSACTIONS,
] as const
