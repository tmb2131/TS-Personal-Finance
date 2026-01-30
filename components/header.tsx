'use client'

import { useRouter } from 'next/navigation'
import { CurrencyToggle } from './currency-toggle'
import { Button } from './ui/button'
import { RefreshCw, LogOut } from 'lucide-react'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

export function Header() {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [lastRefreshDate, setLastRefreshDate] = useState<string | null>(null)
  const [latestTransactionDate, setLatestTransactionDate] = useState<string | null>(null)
  const [maxAccountDate, setMaxAccountDate] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
    // Load last refresh date from localStorage
    const stored = localStorage.getItem('lastRefreshDate')
    if (stored) {
      setLastRefreshDate(stored)
    }
    // Fetch latest dates from database
    fetchLatestDates()
  }, [])

  const fetchLatestDates = async () => {
    try {
      const supabase = createClient()
      
      // Fetch latest transaction date
      const { data: transactionData } = await supabase
        .from('transaction_log')
        .select('date')
        .order('date', { ascending: false })
        .limit(1)
      
      if (transactionData && transactionData.length > 0 && transactionData[0]?.date) {
        setLatestTransactionDate(transactionData[0].date)
      }

      // Fetch max account date_updated
      const { data: accountData } = await supabase
        .from('account_balances')
        .select('date_updated')
        .order('date_updated', { ascending: false })
        .limit(1)
      
      if (accountData && accountData.length > 0 && accountData[0]?.date_updated) {
        setMaxAccountDate(accountData[0].date_updated)
      }
    } catch (error) {
      console.error('Error fetching latest dates:', error)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
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
            label: 'Retry',
            onClick: () => handleSync(),
          },
        })
        setSyncing(false)
        return
      }
      
      const result = await response.json()
      console.log('Sync result:', result)
      setSyncing(false)
      
      if (result.success) {
        // Store last refresh date
        const now = new Date().toISOString()
        localStorage.setItem('lastRefreshDate', now)
        setLastRefreshDate(now)
        
        toast.success('Data Synced Successfully', {
          description: 'All sheets have been synchronized with the database.',
        })
        
        // Refresh latest dates after sync
        await fetchLatestDates()
        
        // Refresh the page to show updated data
        setTimeout(() => {
          window.location.reload()
        }, 1000)
      } else {
        const errorMsg = result.error || 'Some sheets failed to sync'
        const failedSheets = result.results?.filter((r: any) => !r.success).map((r: any) => r.sheet).join(', ')
        console.error('Sync failed:', result.results)
        toast.error('Partial Sync Failure', {
          description: failedSheets 
            ? `Failed to sync: ${failedSheets}. ${errorMsg}`
            : errorMsg,
          action: {
            label: 'Retry',
            onClick: () => handleSync(),
          },
        })
      }
    } catch (error) {
      clearTimeout(timeoutId)
      setSyncing(false)
      const isAborted = error instanceof Error && error.name === 'AbortError'
      console.error('Sync error:', error)
      if (isAborted) {
        toast.warning('Sync taking longer than expected', {
          description: 'The sync may still be running on the server. Refresh the page in a minute to see updated data.',
        })
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        toast.error('Sync Error', {
          description: `Unable to connect to sync service. ${errorMessage}`,
          action: {
            label: 'Retry',
            onClick: () => handleSync(),
          },
        })
      }
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <header className="flex h-16 items-center justify-between border-b px-4 md:px-6">
      <div className="flex items-center gap-2 md:gap-4 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 text-xs md:text-sm"
        >
          <RefreshCw className={`h-3 w-3 md:h-4 md:w-4 ${syncing ? 'animate-spin' : ''}`} />
          {mounted ? (
            <>
              <span className="hidden sm:inline">{syncing ? 'Syncing...' : 'Refresh Data'}</span>
              <span className="sm:hidden">{syncing ? 'Sync...' : 'Refresh'}</span>
            </>
          ) : (
            <span>Refresh Data</span>
          )}
        </Button>
        
        {mounted && (
          <div className="flex items-center gap-2 md:gap-3 lg:gap-4 text-xs text-muted-foreground flex-wrap">
            <div className="hidden md:block">
              <span className="font-medium">Last Refresh:</span>{' '}
              <span className="text-foreground">{formatDate(lastRefreshDate)}</span>
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
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="flex items-center gap-2 text-xs md:text-sm"
          aria-label="Log out"
        >
          <LogOut className="h-3 w-3 md:h-4 md:w-4" />
          <span className="hidden sm:inline">Log out</span>
        </Button>
        <CurrencyToggle />
      </div>
    </header>
  )
}
