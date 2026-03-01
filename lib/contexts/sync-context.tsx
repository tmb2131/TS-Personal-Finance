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
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { HeaderStatus } from '@/lib/data/cached-queries'

/** Custom event dispatched after a successful sync so client components can re-fetch. */
export const SYNC_COMPLETED_EVENT = 'sync-completed'

type SyncResultRow = { sheet: string; success: boolean; rowsProcessed: number }

interface SyncContextValue {
  syncing: boolean
  handleSync: () => Promise<void>
  lastRefreshDate: string | null
  latestTransactionDate: string | null
  maxAccountDate: string | null
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
  const date = new Date(dateString)
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
  const [syncing, setSyncing] = useState(false)
  const [lastRefreshDate, setLastRefreshDate] = useState<string | null>(initialHeaderData?.lastSyncAt ?? null)
  const [latestTransactionDate, setLatestTransactionDate] = useState<string | null>(
    initialHeaderData?.latestTransactionDate ?? null
  )
  const [maxAccountDate, setMaxAccountDate] = useState<string | null>(initialHeaderData?.maxAccountDate ?? null)
  const syncStartTimeRef = useRef<number | null>(null)

  const fetchLatestDates = useCallback(async () => {
    try {
      const supabase = createClient()
      const [syncResult, txResult, acctResult] = await Promise.all([
        supabase.from('sync_metadata').select('last_sync_at').maybeSingle(),
        supabase.from('transaction_log').select('date').order('date', { ascending: false }).limit(1),
        supabase.from('account_balances').select('date_updated').order('date_updated', { ascending: false }).limit(1),
      ])
      if (syncResult.data?.last_sync_at) setLastRefreshDate(syncResult.data.last_sync_at)
      if (txResult.data?.[0]?.date) setLatestTransactionDate(txResult.data[0].date)
      if (acctResult.data?.[0]?.date_updated) setMaxAccountDate(acctResult.data[0].date_updated)
    } catch (error) {
      console.error('Error fetching latest dates:', error)
    }
  }, [])

  useEffect(() => {
    if (!initialHeaderData) fetchLatestDates()
  }, [initialHeaderData, fetchLatestDates])

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
        window.dispatchEvent(new CustomEvent(SYNC_COMPLETED_EVENT))
        setLastRefreshDate(new Date().toISOString())
        fetchLatestDates()
        // Refresh all server-rendered data and rerender current screen
        setTimeout(() => router.refresh(), 0)
      } else {
        const errorMsg = result.error || 'Transaction Log sync failed'
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
          description: 'Transaction Log sync may still be running. Refresh in a minute to check.',
        })
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        toast.error('Sync Error', {
          description: `Unable to connect to sync service. ${errorMessage}`,
          action: { label: 'Sync Now', onClick: () => handleSync() },
        })
      }
    }
  }, [fetchLatestDates, router])

  useEffect(() => {
    const onVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return
      if (!syncing) return
      const startedAt = syncStartTimeRef.current
      if (startedAt == null) return
      await new Promise((r) => setTimeout(r, 1500))
      try {
        const supabase = createClient()
        const { data } = await supabase.from('sync_metadata').select('last_sync_at').maybeSingle()
        const lastSyncAt = data?.last_sync_at ? new Date(data.last_sync_at).getTime() : 0
        if (lastSyncAt >= startedAt) {
          setSyncing(false)
          syncStartTimeRef.current = null
          await fetchLatestDates()
          toast.success('Sync Complete', { description: 'Sheet sync completed while you were away.' })
          window.dispatchEvent(new CustomEvent(SYNC_COMPLETED_EVENT))
          setTimeout(() => router.refresh(), 0)
        } else {
          setSyncing(false)
          syncStartTimeRef.current = null
          toast.info('Sync interrupted', {
            description: 'Tap Sync Transaction Log to try again.',
            action: { label: 'Sync Now', onClick: handleSync },
          })
        }
      } catch {
        setSyncing(false)
        syncStartTimeRef.current = null
        toast.info('Sync interrupted', {
          description: 'Tap Sync Transaction Log to try again.',
          action: { label: 'Sync Now', onClick: handleSync },
        })
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [syncing, fetchLatestDates, router, handleSync])

  const value: SyncContextValue = {
    syncing,
    handleSync,
    lastRefreshDate,
    latestTransactionDate,
    maxAccountDate,
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
