'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { HeaderStatus } from '@/lib/data/cached-queries'
import type { IngestionStatusSnapshot } from '@/lib/ingestion-shared'
import { parseLocalDate } from '@/lib/date-utils'

/** @deprecated Prefer queryClient.invalidateQueries() — kept for backward compat only. */
export const SYNC_COMPLETED_EVENT = 'sync-completed'

type SyncResultRow = { sheet: string; success: boolean; rowsProcessed: number }

interface SyncContextValue {
  syncing: boolean
  handleSync: () => Promise<void>
  lastRefreshDate: string | null
  latestTransactionDate: string | null
  maxAccountDate: string | null
  ingestionStatus: IngestionStatusSnapshot | null
  refreshIngestionStatus: () => Promise<void>
  formatLastSheetSync: (dateString: string | null) => string
  formatDate: (dateString: string | null) => string
}

const SyncContext = createContext<SyncContextValue | null>(null)

function formatSyncResults(results: SyncResultRow[]): string {
  if (!results || results.length === 0) return 'Sync completed.'
  const succeeded = results.filter((r) => r.success && r.rowsProcessed > 0)
  const failed = results.filter((r) => !r.success)
  const parts: string[] = []
  if (succeeded.length > 0) {
    const details = succeeded.map((r) => `${r.rowsProcessed.toLocaleString()} ${r.sheet.toLowerCase()} rows`)
    parts.push(`Synced ${details.join(', ')}`)
  }
  if (failed.length > 0) {
    parts.push(`Failed: ${failed.map((r) => r.sheet).join(', ')}`)
  }
  if (parts.length === 0) return 'No new data to sync.'
  return parts.join('. ')
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'N/A'
  const date = parseLocalDate(dateString)
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatLastSheetSync(dateString: string | null): string {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  if (isToday) {
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    }
    const diffMins = Math.floor(diffMs / (1000 * 60))
    return diffMins < 1 ? 'Just now' : `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
  }

  return formatDate(dateString)
}

interface SyncProviderProps {
  children: ReactNode
  initialHeaderData?: HeaderStatus | null
}

export function SyncProvider({ children, initialHeaderData }: SyncProviderProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [syncing, setSyncing] = useState(false)
  const [lastRefreshDate, setLastRefreshDate] = useState<string | null>(initialHeaderData?.lastSyncAt ?? null)
  const [latestTransactionDate, setLatestTransactionDate] = useState<string | null>(
    initialHeaderData?.latestTransactionDate ?? null
  )
  const [maxAccountDate, setMaxAccountDate] = useState<string | null>(initialHeaderData?.maxAccountDate ?? null)
  const [ingestionStatus, setIngestionStatus] = useState<IngestionStatusSnapshot | null>(null)
  const syncStartTimeRef = useRef<number | null>(null)

  const applyIngestionStatus = useCallback((status: IngestionStatusSnapshot) => {
    setIngestionStatus(status)
    setLastRefreshDate(status.lastSyncAt)
    setLatestTransactionDate(status.latestTransactionDate)
    setMaxAccountDate(status.maxAccountDate)
  }, [])

  const refreshIngestionStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/ingestion/status', { cache: 'no-store' })
      if (!response.ok) return
      const result = await response.json()
      if (result.success && result.data) {
        applyIngestionStatus(result.data as IngestionStatusSnapshot)
      }
    } catch (error) {
      console.error('Error fetching ingestion status:', error)
    }
  }, [applyIngestionStatus])

  useEffect(() => {
    refreshIngestionStatus()
  }, [refreshIngestionStatus])

  const invalidateAllQueries = useCallback(() => {
    queryClient.invalidateQueries()
    window.dispatchEvent(new CustomEvent(SYNC_COMPLETED_EVENT))
  }, [queryClient])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    syncStartTimeRef.current = Date.now()
    const abortController = new AbortController()
    const timeoutId = setTimeout(() => {
      abortController.abort()
    }, 5 * 60 * 1000)
    try {
      console.log('Starting sync...')
      const response = await fetch('/api/sync', {
        method: 'POST',
        signal: abortController.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Sync API error response:', response.status, errorData)
        const errorMessage = errorData.error || 'Unknown error occurred'
        toast.error('Sync Failed', {
          description: errorMessage,
          action: { label: 'Sync Now', onClick: () => handleSync() },
        })
        syncStartTimeRef.current = null
        setSyncing(false)
        return
      }

      const result = await response.json()
      console.log('Sync result:', result)
      syncStartTimeRef.current = null
      setSyncing(false)

      if (result.success) {
        toast.success('Sync Complete', {
          description: formatSyncResults(result.results ?? []),
        })
        invalidateAllQueries()
        await refreshIngestionStatus()
        setTimeout(() => router.refresh(), 0)
      } else {
        const errorMsg = result.error || 'Google Sheet refresh failed'
        const failedSheets = result.results
          ?.filter((r: SyncResultRow) => !r.success)
          .map((r: SyncResultRow) => r.sheet)
          .join(', ')
        console.error('Sync failed:', result.results)
        toast.error('Sync Failure', {
          description: failedSheets ? `Failed to sync: ${failedSheets}. ${errorMsg}` : errorMsg,
          action: { label: 'Sync Now', onClick: () => handleSync() },
        })
      }
    } catch (error) {
      clearTimeout(timeoutId)
      syncStartTimeRef.current = null
      setSyncing(false)
      const isAborted = error instanceof Error && error.name === 'AbortError'
      console.error('Sync error:', error)
      if (isAborted) {
        toast.warning('Sync taking longer than expected', {
          description: 'Google Sheet refresh may still be running. Refresh in a minute to check.',
        })
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        toast.error('Sync Error', {
          description: `Unable to connect to sync service. ${errorMessage}`,
          action: { label: 'Sync Now', onClick: () => handleSync() },
        })
      }
    }
  }, [refreshIngestionStatus, router, invalidateAllQueries])

  useEffect(() => {
    const onVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return
      if (!syncing) return
      const startedAt = syncStartTimeRef.current
      if (startedAt == null) return
      await new Promise((r) => setTimeout(r, 1500))
      try {
        const response = await fetch('/api/ingestion/status', { cache: 'no-store' })
        const result = await response.json().catch(() => ({}))
        const lastSyncAt = result?.data?.lastSyncAt ? new Date(result.data.lastSyncAt).getTime() : 0
        if (lastSyncAt >= startedAt) {
          setSyncing(false)
          syncStartTimeRef.current = null
          if (result?.success && result?.data) {
            applyIngestionStatus(result.data as IngestionStatusSnapshot)
          } else {
            await refreshIngestionStatus()
          }
          toast.success('Sync Complete', { description: 'Sheet refresh completed while you were away.' })
          invalidateAllQueries()
          setTimeout(() => router.refresh(), 0)
        } else {
          setSyncing(false)
          syncStartTimeRef.current = null
          toast.info('Sync interrupted', {
            description: 'Tap Refresh Sheet to try again.',
            action: { label: 'Sync Now', onClick: handleSync },
          })
        }
      } catch {
        setSyncing(false)
        syncStartTimeRef.current = null
        toast.info('Sync interrupted', {
          description: 'Tap Refresh Sheet to try again.',
          action: { label: 'Sync Now', onClick: handleSync },
        })
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [syncing, applyIngestionStatus, refreshIngestionStatus, router, handleSync, invalidateAllQueries])

  const value: SyncContextValue = {
    syncing,
    handleSync,
    lastRefreshDate,
    latestTransactionDate,
    maxAccountDate,
    ingestionStatus,
    refreshIngestionStatus,
    formatLastSheetSync,
    formatDate,
  }

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync must be used within SyncProvider')
  return ctx
}
