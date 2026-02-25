'use client'

import { useRouter } from 'next/navigation'
import { CurrencyToggle } from './currency-toggle'
import { ThemeToggle } from './theme-toggle'
import { Button } from './ui/button'
import { RefreshCw, BarChart3 } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { useDailySummary } from '@/components/insights/daily-summary-context'
import { cn } from '@/utils/cn'
import type { HeaderStatus } from '@/lib/data/cached-queries'

// Safe hook that returns null if context is not available
function useDailySummarySafe() {
  try {
    return useDailySummary()
  } catch {
    return null
  }
}

/** Custom event dispatched after a successful sync so client components can re-fetch. */
export const SYNC_COMPLETED_EVENT = 'sync-completed'

const SCROLL_THRESHOLD = 8
const BOTTOM_BOUNDARY_PX = 100
// Only hide header when this far (or more) from bottom; avoids flicker when reaching bottom
const HIDE_MIN_DISTANCE_FROM_BOTTOM_PX = 180

export function Header({ initialData }: { initialData?: HeaderStatus | null }) {
  const router = useRouter()
  const isMobile = useIsMobile()
  const dailySummary = useDailySummarySafe()
  const [syncing, setSyncing] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [headerVisible, setHeaderVisible] = useState(true)
  const lastScrollTop = useRef(0)
  const [lastRefreshDate, setLastRefreshDate] = useState<string | null>(initialData?.lastSyncAt ?? null)
  const [latestTransactionDate, setLatestTransactionDate] = useState<string | null>(initialData?.latestTransactionDate ?? null)
  const [maxAccountDate, setMaxAccountDate] = useState<string | null>(initialData?.maxAccountDate ?? null)
  const syncStartTimeRef = useRef<number | null>(null)

  useEffect(() => {
    setMounted(true)
    // If initialData was provided by the server, skip the client fetch on mount
    if (!initialData) fetchLatestDates()
  }, [])

  // When user returns to app (e.g. from home screen), recover if sync was in progress — mobile often suspends/kills in-flight requests
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
          setTimeout(() => router.refresh(), 800)
        } else {
          setSyncing(false)
          syncStartTimeRef.current = null
          toast.info('Sync interrupted', {
            description: 'Tap Sync Transaction Log to try again.',
            action: { label: 'Sync Now', onClick: () => handleSync() },
          })
        }
      } catch {
        setSyncing(false)
        syncStartTimeRef.current = null
        toast.info('Sync interrupted', {
          description: 'Tap Sync Transaction Log to try again.',
          action: { label: 'Sync Now', onClick: () => handleSync() },
        })
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [syncing])

  // Hide header on scroll down, show on scroll up (mobile only). Disable toggle near bottom to prevent rubber-band flicker.
  useEffect(() => {
    if (!isMobile) return
    const el = document.querySelector('.main-content') as HTMLElement | null
    if (!el) return
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      if (distanceFromBottom < BOTTOM_BOUNDARY_PX) {
        setHeaderVisible(true)
        lastScrollTop.current = scrollTop
        return
      }
      if (scrollTop <= 0) {
        setHeaderVisible(true)
      } else if (scrollTop > lastScrollTop.current && scrollTop > SCROLL_THRESHOLD) {
        if (distanceFromBottom >= HIDE_MIN_DISTANCE_FROM_BOTTOM_PX) {
          setHeaderVisible(false)
        }
      } else if (scrollTop < lastScrollTop.current) {
        setHeaderVisible(true)
      }
      lastScrollTop.current = scrollTop
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [isMobile])

  const fetchLatestDates = async () => {
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
  }

  const handleSync = async () => {
    setSyncing(true)
    syncStartTimeRef.current = Date.now()
    const abortController = new AbortController()
    const timeoutId = setTimeout(() => {
      abortController.abort()
    }, 5 * 60 * 1000) // 5 minute client timeout so we don't hang forever
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
          action: {
            label: 'Sync Now',
            onClick: () => handleSync(),
          },
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
          description: formatSyncResults(result.results),
        })
        // Notify client components (e.g. TransactionsList) to re-fetch
        window.dispatchEvent(new CustomEvent(SYNC_COMPLETED_EVENT))
        // Optimistically show "Just now" before the DB round-trip completes
        setLastRefreshDate(new Date().toISOString())
        // Update other dates in background (non-blocking)
        fetchLatestDates()
        // Refresh server components — cache is already invalidated server-side
        setTimeout(() => router.refresh(), 100)
      } else {
        const errorMsg = result.error || 'Transaction Log sync failed'
        const failedSheets = result.results?.filter((r: any) => !r.success).map((r: any) => r.sheet).join(', ')
        console.error('Sync failed:', result.results)
        toast.error('Sync Failure', {
          description: failedSheets 
            ? `Failed to sync: ${failedSheets}. ${errorMsg}`
            : errorMsg,
          action: {
            label: 'Sync Now',
            onClick: () => handleSync(),
          },
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
          action: {
            label: 'Sync Now',
            onClick: () => handleSync(),
          },
        })
      }
    }
  }

  /** Build a human-readable description from per-sheet sync results. */
  const formatSyncResults = (results: { sheet: string; success: boolean; rowsProcessed: number }[]): string => {
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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const formatLastSheetSync = (dateString: string | null) => {
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

  return (
    <header
      className={cn(
        'z-40 flex h-16 shrink-0 items-center justify-between border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6 transition-transform duration-200 ease-out',
        isMobile && !headerVisible && '-translate-y-full -mt-16'
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5 md:gap-4">
        {dailySummary && (
          <Button
            variant="outline"
            size="sm"
            onClick={dailySummary.openModal}
            className="h-9 gap-1.5 px-2 text-xs md:px-3 md:text-sm"
            title="View daily financial summary"
          >
            <BarChart3 className="h-3 w-3 md:h-4 md:w-4" />
            <span className="hidden md:inline">Daily Summary</span>
            <span className="md:hidden">Summary</span>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncing}
          className="h-9 gap-1.5 px-2 text-xs md:px-3 md:text-sm"
        >
          <RefreshCw className={`h-3 w-3 md:h-4 md:w-4 ${syncing ? 'animate-spin' : ''}`} />
          {mounted ? (
            <>
              <span className="hidden md:inline">Sync Transaction Log</span>
              <span className="md:hidden">Sync Log</span>
            </>
          ) : (
            <>
              <span className="hidden md:inline">Sync Transaction Log</span>
              <span className="md:hidden">Sync Log</span>
            </>
          )}
        </Button>
        
        {mounted && (
          <>
            <div className="min-w-0 text-xs text-muted-foreground md:hidden">
              <span className="text-foreground">
                {syncing ? 'Syncing...' : formatLastSheetSync(lastRefreshDate)}
              </span>
            </div>
            <div className="hidden min-w-0 items-center gap-2 text-xs text-muted-foreground md:flex md:gap-3 lg:gap-4">
              <div className="hidden md:block">
                <span className="font-medium">Last Sheet Sync:</span>{' '}
                <span className="text-foreground">{formatLastSheetSync(lastRefreshDate)}</span>
              </div>
              <div className="hidden lg:block">
                <span className="font-medium">Latest Transaction:</span>{' '}
                <span className="text-foreground">{formatDate(latestTransactionDate)}</span>
              </div>
              <div className="hidden lg:block">
                <span className="font-medium">Latest Account:</span>{' '}
                <span className="text-foreground">{formatDate(maxAccountDate)}</span>
              </div>
            </div>
          </>
        )}
      </div>
      <div className="flex items-center gap-1.5 md:gap-2">
        <ThemeToggle />
        <CurrencyToggle />
      </div>
    </header>
  )
}
