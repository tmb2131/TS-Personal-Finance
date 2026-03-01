'use client'

import { CurrencyToggle } from './currency-toggle'
import { ThemeToggle } from './theme-toggle'
import { Button } from './ui/button'
import { RefreshCw, BarChart3, MessageCircle } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { useSync } from '@/lib/contexts/sync-context'
import { useDailySummary } from '@/components/insights/daily-summary-context'
import { cn } from '@/utils/cn'
import type { HeaderStatus } from '@/lib/data/cached-queries'

// Re-export for consumers that imported from header
export { SYNC_COMPLETED_EVENT } from '@/lib/contexts/sync-context'

// Safe hook that returns null if context is not available
function useDailySummarySafe() {
  try {
    return useDailySummary()
  } catch {
    return null
  }
}

const SCROLL_THRESHOLD = 8
const BOTTOM_BOUNDARY_PX = 100
// Only hide header when this far (or more) from bottom; avoids flicker when reaching bottom
const HIDE_MIN_DISTANCE_FROM_BOTTOM_PX = 180

export function Header({ initialData: _initialData }: { initialData?: HeaderStatus | null }) {
  const isMobile = useIsMobile()
  const dailySummary = useDailySummarySafe()
  const {
    syncing,
    handleSync,
    lastRefreshDate,
    latestTransactionDate,
    maxAccountDate,
    formatLastSheetSync,
    formatDate,
  } = useSync()
  const [mounted, setMounted] = useState(false)
  const [headerVisible, setHeaderVisible] = useState(true)
  const [scrolled, setScrolled] = useState(false)
  const lastScrollTop = useRef(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Hide header on scroll down, show on scroll up (mobile only). Disable toggle near bottom to prevent rubber-band flicker.
  useEffect(() => {
    const el = document.querySelector('.main-content') as HTMLElement | null
    if (!el) return
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      setScrolled(scrollTop > 8)
      if (isMobile) {
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
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [isMobile])

  return (
    <header
      className={cn(
        'z-40 flex min-h-16 shrink-0 items-center justify-between border-b bg-background/95 px-3 pt-[env(safe-area-inset-top,0px)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6 md:pt-0 transition-transform duration-200 ease-out',
        isMobile && !headerVisible && '-translate-y-full -mt-16',
        isMobile && scrolled && headerVisible && 'shadow-sm'
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="md:hidden h-11 w-11 min-h-[44px] min-w-[44px]"
          onClick={() => window.dispatchEvent(new Event('findash:open-chat-widget'))}
          aria-label="Open AI Assistant"
        >
          <MessageCircle className="h-5 w-5" />
        </Button>
        <ThemeToggle />
        <CurrencyToggle />
      </div>
    </header>
  )
}
