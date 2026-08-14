'use client'

import { CurrencyToggle } from './currency-toggle'
import { SyncStatusPill } from './sync-status-pill'
import { Button } from './ui/button'
import { RefreshCw, Plus } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { useSync } from '@/lib/contexts/sync-context'
import { cn } from '@/utils/cn'
import type { HeaderStatus } from '@/lib/data/cached-queries'

// Re-export for consumers that imported from header
export { SYNC_COMPLETED_EVENT } from '@/lib/contexts/sync-context'

const SCROLL_THRESHOLD = 8
const BOTTOM_BOUNDARY_PX = 100
// Only hide header when this far (or more) from bottom; avoids flicker when reaching bottom
const HIDE_MIN_DISTANCE_FROM_BOTTOM_PX = 180

export function Header({ initialData: _initialData }: { initialData?: HeaderStatus | null }) {
  const isMobile = useIsMobile()
  const {
    syncing,
    handleSync,
    latestTransactionDate,
    maxAccountDate,
    ingestionStatus,
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
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncing || (!!ingestionStatus && !ingestionStatus.sheetConnected)}
          className="h-9 gap-1.5 px-2 text-xs md:px-3 md:text-sm"
          title={ingestionStatus && !ingestionStatus.sheetConnected ? 'Connect a Google Sheet source in Settings to enable refresh.' : undefined}
        >
          <RefreshCw className={`h-3 w-3 md:h-4 md:w-4 ${syncing ? 'animate-spin' : ''}`} />
          {mounted ? (
            <>
              <span className="hidden md:inline">Refresh Sheet</span>
              <span className="md:hidden">Sheet</span>
            </>
          ) : (
            <>
              <span className="hidden md:inline">Refresh Sheet</span>
              <span className="md:hidden">Sheet</span>
            </>
          )}
        </Button>
        
        {mounted && (
          <>
            <SyncStatusPill className="md:hidden" />
            <div className="hidden min-w-0 items-center gap-2 md:flex md:gap-3 lg:gap-4">
              <SyncStatusPill />
              <div className="hidden text-xs text-muted-foreground md:block">
                <span className="font-medium">Sources:</span>{' '}
                <span className="text-foreground">{ingestionStatus?.connectedSources ?? 0}</span>
              </div>
              <div className="hidden text-xs text-muted-foreground lg:block">
                <span className="font-medium">Latest Transaction:</span>{' '}
                <span className="text-foreground">{formatDate(latestTransactionDate)}</span>
              </div>
              <div className="hidden text-xs text-muted-foreground lg:block">
                <span className="font-medium">Latest Account:</span>{' '}
                <span className="text-foreground">{formatDate(maxAccountDate)}</span>
              </div>
            </div>
          </>
        )}
      </div>
      {/* Sync status, refresh, currency chip, quick add. Theme and log out
          moved to Settings — neither is frequent enough to hold permanent chrome. */}
      <div className="flex items-center gap-1.5 md:gap-2">
        <CurrencyToggle />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => window.dispatchEvent(new Event('findash:open-quick-add'))}
          className="h-9 min-h-[44px] gap-1.5 px-3 text-meta md:min-h-0"
          title="Quick add"
          aria-label="Quick add"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden lg:inline">Quick add</span>
        </Button>
      </div>
    </header>
  )
}
